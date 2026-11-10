#!/usr/bin/env node
// Vets npm packages before they are installed (docs/DEPENDENCIES.md). For each name[@range] it prints the stable version
// we would take, how old it is, who publishes it, weekly downloads, the repository, whether it is deprecated and whether
// it runs install scripts. It exits 1 if anything fails the policy. Usage: node scripts/vet-packages.mjs fastify zod@4 ...
import { execFileSync } from 'node:child_process';

const MIN_AGE_DAYS = 14; // a release must have been public this long (time for the community to catch a bad one)
const MIN_WEEKLY_DOWNLOADS = 50_000; // below this a package needs the owner's written exception in docs/DEPENDENCIES.md
const MILLISECONDS_PER_DAY = 86_400_000;

/** Asks the npm registry about a package (`npm view <package> <field> --json`) and returns the parsed answer. */
const askNpmRegistry = (...viewArguments) =>
  JSON.parse(
    execFileSync('npm', ['view', ...viewArguments, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }) || 'null',
  );

/** True for plain release numbers like 4.2.1, and false for -beta, -rc, -next or -canary builds. */
const isStableVersion = (version) => /^\d+\.\d+\.\d+$/.test(version);

/** How many whole days ago a date was. */
const daysSince = (dateText) => Math.round((Date.now() - new Date(dateText).getTime()) / MILLISECONDS_PER_DAY);

/** Checks one package against the policy and returns what we found and which rules it breaks. */
async function vetPackage(packageSpec) {
  const atSignPosition = packageSpec.lastIndexOf('@');
  const packageName = atSignPosition > 0 ? packageSpec.slice(0, atSignPosition) : packageSpec;
  const versionRange = atSignPosition > 0 ? packageSpec.slice(atSignPosition + 1) : '';
  const problems = [];
  let allVersions;
  let publishTimes;
  let latestVersion;
  try {
    allVersions = askNpmRegistry(packageName, 'versions');
    publishTimes = askNpmRegistry(packageName, 'time');
    latestVersion = askNpmRegistry(packageName, 'dist-tags.latest');
  } catch {
    return { packageSpec, problems: ['not found on the npm registry'] };
  }
  const eligibleVersions = (Array.isArray(allVersions) ? allVersions : [allVersions])
    .filter(isStableVersion)
    .filter(
      (version) =>
        !versionRange ||
        version === versionRange ||
        version.startsWith(versionRange + '.') ||
        version.startsWith(versionRange),
    )
    .filter((version) => daysSince(publishTimes[version]) >= MIN_AGE_DAYS);
  const chosenVersion = eligibleVersions
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
    .at(-1);
  if (!chosenVersion) {
    return {
      packageSpec,
      problems: [
        `no stable release older than ${MIN_AGE_DAYS} days${versionRange ? ` matches "${versionRange}"` : ''}`,
      ],
    };
  }
  const versionDetails = askNpmRegistry(`${packageName}@${chosenVersion}`);
  const versionAgeDays = daysSince(publishTimes[chosenVersion]);
  const packageAgeDays = daysSince(publishTimes.created);
  let weeklyDownloads = null;
  try {
    const downloadsResponse = await fetch(
      `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`,
    );
    weeklyDownloads = (await downloadsResponse.json()).downloads ?? null;
  } catch {
    /* offline: reported below */
  }
  const repositoryUrl = (versionDetails.repository?.url ?? versionDetails.repository ?? '')
    .toString()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  const maintainerNames = (versionDetails.maintainers ?? []).map((maintainer) =>
    typeof maintainer === 'string' ? maintainer : maintainer.name,
  );
  const installScripts = ['preinstall', 'install', 'postinstall'].filter(
    (scriptName) => versionDetails.scripts?.[scriptName],
  );
  if (versionDetails.deprecated) problems.push(`DEPRECATED: ${versionDetails.deprecated}`);
  if (weeklyDownloads === null) problems.push('could not read download counts');
  else if (weeklyDownloads < MIN_WEEKLY_DOWNLOADS) {
    problems.push(
      `only ${weeklyDownloads.toLocaleString()} downloads a week (< ${MIN_WEEKLY_DOWNLOADS.toLocaleString()})`,
    );
  }
  if (!repositoryUrl) problems.push('no repository link');
  if (!maintainerNames.length) problems.push('no maintainers listed');
  if (packageAgeDays < 180) problems.push(`package is only ${packageAgeDays} days old`);
  if (latestVersion !== chosenVersion && isStableVersion(latestVersion)) {
    problems.push(`note: newer ${latestVersion} exists but is under ${MIN_AGE_DAYS} days old or out of range`);
  }
  return {
    packageSpec,
    packageName,
    chosenVersion,
    versionAgeDays,
    weeklyDownloads,
    repositoryUrl,
    maintainerNames,
    installScripts,
    license: versionDetails.license,
    problems,
  };
}

const packageSpecs = process.argv.slice(2);
if (!packageSpecs.length) {
  console.error('Usage: node scripts/vet-packages.mjs <name[@major]>...');
  process.exit(2);
}
let anyPackageFailed = false;
for (const packageSpec of packageSpecs) {
  const result = await vetPackage(packageSpec);
  const hardProblems = result.problems.filter((problem) => !problem.startsWith('note:'));
  if (hardProblems.length) anyPackageFailed = true;
  if (!result.packageName) {
    console.log(`✗ ${packageSpec}: ${result.problems.join('; ')}`);
    continue;
  }
  const maintainerSummary = `${result.maintainerNames.slice(0, 3).join(', ')}${result.maintainerNames.length > 3 ? '…' : ''}`;
  const installScriptNote = result.installScripts.length
    ? `  [install scripts: ${result.installScripts.join(',')}]`
    : '';
  console.log(
    `${hardProblems.length ? '✗' : '✓'} ${result.packageName}@${result.chosenVersion}  ${result.versionAgeDays}d old  ` +
      `${result.weeklyDownloads?.toLocaleString() ?? '?'}/wk  ${result.license ?? '?'}  by ${maintainerSummary}  ${result.repositoryUrl}${installScriptNote}`,
  );
  for (const problem of result.problems) console.log(`    - ${problem}`);
}
process.exit(anyPackageFailed ? 1 : 0);
