#!/usr/bin/env node
// Vets npm packages before they are installed (docs/DEPENDENCIES.md). For each name[@range] it prints the stable version
// we would take, how old it is, who publishes it, weekly downloads, the repository, whether it is deprecated and whether
// it runs install scripts. It exits 1 if anything fails the policy. Usage: node scripts/vet-packages.mjs fastify zod@4 ...
import { execFileSync } from 'node:child_process';

const MIN_AGE_DAYS = 14; // a release must have been public this long (time for the community to catch a bad one)
const MIN_WEEKLY_DOWNLOADS = 50_000; // below this a package needs the owner's written exception in docs/DEPENDENCIES.md
const day = 86_400_000;

const npm = (...args) => JSON.parse(execFileSync('npm', ['view', ...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) || 'null');
const isStable = (v) => /^\d+\.\d+\.\d+$/.test(v); // no -beta, -rc, -next, -canary

async function vet(spec) {
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  const range = at > 0 ? spec.slice(at + 1) : '';
  const problems = [];
  let versions, times, latest;
  try {
    versions = npm(name, 'versions');
    times = npm(name, 'time');
    latest = npm(name, 'dist-tags.latest');
  } catch {
    return { spec, problems: ['not found on the npm registry'] };
  }
  const wanted = (Array.isArray(versions) ? versions : [versions])
    .filter(isStable)
    .filter((v) => !range || v === range || v.startsWith(range + '.') || v.startsWith(range))
    .filter((v) => (Date.now() - new Date(times[v]).getTime()) / day >= MIN_AGE_DAYS);
  const version = wanted.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  if (!version) return { spec, problems: [`no stable release older than ${MIN_AGE_DAYS} days${range ? ` matches "${range}"` : ''}`] };
  const meta = npm(`${name}@${version}`);
  const ageDays = Math.round((Date.now() - new Date(times[version]).getTime()) / day);
  const firstDays = Math.round((Date.now() - new Date(times.created).getTime()) / day);
  let weekly = null;
  try {
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`);
    weekly = (await res.json()).downloads ?? null;
  } catch {
    /* offline: reported below */
  }
  const repo = (meta.repository?.url ?? meta.repository ?? '').toString().replace(/^git\+/, '').replace(/\.git$/, '');
  const maintainers = (meta.maintainers ?? []).map((m) => (typeof m === 'string' ? m : m.name));
  const scripts = ['preinstall', 'install', 'postinstall'].filter((s) => meta.scripts?.[s]);
  if (meta.deprecated) problems.push(`DEPRECATED: ${meta.deprecated}`);
  if (weekly === null) problems.push('could not read download counts');
  else if (weekly < MIN_WEEKLY_DOWNLOADS) problems.push(`only ${weekly.toLocaleString()} downloads a week (< ${MIN_WEEKLY_DOWNLOADS.toLocaleString()})`);
  if (!repo) problems.push('no repository link');
  if (!maintainers.length) problems.push('no maintainers listed');
  if (firstDays < 180) problems.push(`package is only ${firstDays} days old`);
  if (latest !== version && isStable(latest)) problems.push(`note: newer ${latest} exists but is under ${MIN_AGE_DAYS} days old or out of range`);
  return { spec, name, version, ageDays, weekly, repo, maintainers, scripts, license: meta.license, problems };
}

const specs = process.argv.slice(2);
if (!specs.length) {
  console.error('Usage: node scripts/vet-packages.mjs <name[@major]>...');
  process.exit(2);
}
let failed = false;
for (const spec of specs) {
  const r = await vet(spec);
  const hard = r.problems.filter((p) => !p.startsWith('note:'));
  if (hard.length) failed = true;
  if (!r.name) {
    console.log(`✗ ${spec}: ${r.problems.join('; ')}`);
    continue;
  }
  console.log(
    `${hard.length ? '✗' : '✓'} ${r.name}@${r.version}  ${r.ageDays}d old  ${r.weekly?.toLocaleString() ?? '?'}/wk  ${r.license ?? '?'}  ` +
      `by ${r.maintainers.slice(0, 3).join(', ')}${r.maintainers.length > 3 ? '…' : ''}  ${r.repo}` +
      `${r.scripts.length ? `  [install scripts: ${r.scripts.join(',')}]` : ''}`,
  );
  for (const p of r.problems) console.log(`    - ${p}`);
}
process.exit(failed ? 1 : 0);
