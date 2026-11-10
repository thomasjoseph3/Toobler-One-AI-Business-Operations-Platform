#!/usr/bin/env node
// The one-feature-at-a-time gate (docs/DEVELOPMENT.md). Reads the table in docs/plan/STATUS.md and fails when the
// rules are broken. Usage: npm run gate
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID_STATUSES = ['planned', 'in_progress', 'in_review', 'approved', 'deferred'];
const STATUS_FILE = path.resolve(import.meta.dirname, '../docs/plan/STATUS.md');

/** Reads the feature rows out of the STATUS.md table: `| F00 | Name | status | [brief](path) | date |`. */
export function readFeatureRows(statusMarkdown) {
  const rows = [];
  for (const line of statusMarkdown.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // A table line starts and ends with "|", so the first and last cells are empty.
    if (cells.length < 7 || !/^F\d{2}$/.test(cells[1])) continue;
    const briefLink = cells[4].match(/\]\(([^)]+)\)/);
    rows.push({ id: cells[1], name: cells[2], status: cells[3], briefPath: briefLink ? briefLink[1] : '', approvedOn: cells[5] });
  }
  return rows;
}

/**
 * Checks the feature rows against the rules and returns a list of problems (empty when all is well).
 * `briefExists(path)` says whether a brief file is there; it is passed in so tests don't need real files.
 */
export function checkFeatureRows(rows, briefExists) {
  const problems = [];
  if (rows.length === 0) return ['No feature rows found in STATUS.md: keep its table format.'];

  const seenIds = new Set();
  for (const row of rows) {
    if (seenIds.has(row.id)) problems.push(`${row.id} appears twice.`);
    seenIds.add(row.id);
    if (!VALID_STATUSES.includes(row.status)) {
      problems.push(`${row.id} has the status "${row.status}". Use one of: ${VALID_STATUSES.join(', ')}.`);
    }
    if (row.status === 'approved' && !/^\d{4}-\d{2}-\d{2}$/.test(row.approvedOn)) {
      problems.push(`${row.id} is approved but has no "Approved on" date (YYYY-MM-DD).`);
    }
    if ((row.status === 'in_progress' || row.status === 'in_review') && !(row.briefPath && briefExists(row.briefPath))) {
      problems.push(`${row.id} is ${row.status} but its brief is missing. Write the brief before building.`);
    }
  }

  const featuresInFlight = rows.filter((row) => row.status === 'in_progress' || row.status === 'in_review');
  if (featuresInFlight.length > 1) {
    problems.push(`Only one feature may be in progress or in review, but there are ${featuresInFlight.length}: ${featuresInFlight.map((row) => row.id).join(', ')}.`);
  }

  // A feature may only have started if every feature above it is approved or deferred by the owner.
  rows.forEach((row, position) => {
    if (row.status === 'planned' || row.status === 'deferred') return;
    const unfinishedEarlier = rows.slice(0, position).filter((earlier) => earlier.status !== 'approved' && earlier.status !== 'deferred');
    if (unfinishedEarlier.length > 0) {
      problems.push(`${row.id} is ${row.status} but ${unfinishedEarlier.map((earlier) => earlier.id).join(', ')} above it is not approved or deferred yet.`);
    }
  });
  return problems;
}

/** Runs the gate on the real STATUS.md; prints the result and sets the exit code. */
function runGate() {
  const statusMarkdown = fs.readFileSync(STATUS_FILE, 'utf8');
  const rows = readFeatureRows(statusMarkdown);
  const briefExists = (briefPath) => fs.existsSync(path.resolve(path.dirname(STATUS_FILE), briefPath));
  const problems = checkFeatureRows(rows, briefExists);
  if (problems.length > 0) {
    console.error('Gate FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const current = rows.find((row) => row.status === 'in_progress' || row.status === 'in_review');
  console.log(`Gate OK: ${current ? `${current.id} ${current.name} is ${current.status}` : 'no feature in progress'}.`);
}

// Run only when started as a command, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runGate();
