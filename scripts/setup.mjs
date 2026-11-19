#!/usr/bin/env node
// One command to get a fresh checkout ready (npm run setup):
//   1. checks you are on the Node version in .nvmrc
//   2. creates .env from .env.example if there is none (you then fill in DATABASE_URL yourself)
//   3. installs the packages if they are missing
//   4. starts the throwaway test database in Docker and applies the migrations to it
// It never touches your development (DATABASE_URL) database: run `npm run db:migrate` yourself when you want that.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

/** The major Node version wanted by .nvmrc text such as "26.13.0" (returns 26). */
export function readWantedNodeMajor(nvmrcText) {
  return Number.parseInt(nvmrcText.trim().replace(/^v/, '').split('.')[0], 10);
}

/** Whether the text of a .env file sets a variable (a line `NAME=value` that is not a comment and not empty). */
export function envFileSetsVariable(environmentFileText, variableName) {
  return environmentFileText
    .split('\n')
    .some((line) => line.startsWith(`${variableName}=`) && line.length > variableName.length + 1);
}

/** Runs a command in the repository, showing its output. Returns true when it succeeded. */
function runCommand(command, commandArguments) {
  return spawnSync(command, commandArguments, { cwd: repositoryRoot, stdio: 'inherit' }).status === 0;
}

/** Prints a step heading so the output is easy to follow. */
const announce = (text) => console.log(`\n==> ${text}`);

/** Stops the setup with an explanation. */
function stopWith(message) {
  console.error(`\nSetup stopped: ${message}`);
  process.exit(1);
}

function runSetup() {
  announce('Checking Node');
  const wantedMajor = readWantedNodeMajor(fs.readFileSync(path.join(repositoryRoot, '.nvmrc'), 'utf8'));
  const currentMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (currentMajor !== wantedMajor)
    stopWith(`this project uses Node ${wantedMajor} but you are on ${process.versions.node}. Run: nvm use`);
  console.log(`Node ${process.versions.node} is right.`);

  announce('Checking .env');
  const environmentFile = path.join(repositoryRoot, '.env');
  if (fs.existsSync(environmentFile)) {
    console.log('.env exists. (Its values are not shown here.)');
  } else {
    fs.copyFileSync(path.join(repositoryRoot, '.env.example'), environmentFile);
    console.log('Created .env from .env.example. Open it and fill in DATABASE_URL before running the app.');
  }
  // The secret that signs sign-in tokens: made here once, and never printed.
  const environmentText = fs.readFileSync(environmentFile, 'utf8');
  if (!envFileSetsVariable(environmentText, 'JWT_SECRET')) {
    const separator = environmentText === '' || environmentText.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(environmentFile, `${separator}JWT_SECRET=${randomBytes(48).toString('base64url')}\n`);
    console.log('Added a random JWT_SECRET to .env (it signs sign-in tokens; its value is not shown).');
  }

  // The secret that scrambles the AI keys businesses save: made here once, and never printed. Losing it makes saved keys unreadable.
  const environmentTextAfterJwt = fs.readFileSync(environmentFile, 'utf8');
  if (!envFileSetsVariable(environmentTextAfterJwt, 'SECRETS_ENCRYPTION_KEY')) {
    const separator = environmentTextAfterJwt === '' || environmentTextAfterJwt.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(environmentFile, `${separator}SECRETS_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`);
    console.log(
      'Added a random SECRETS_ENCRYPTION_KEY to .env (it scrambles saved AI keys; its value is not shown). Back it up: losing it makes saved keys unreadable.',
    );
  }

  announce('Installing packages');
  if (fs.existsSync(path.join(repositoryRoot, 'node_modules'))) console.log('Already installed.');
  else if (!runCommand('npm', ['ci'])) stopWith('npm ci failed.');

  announce('Starting the test database (Docker)');
  if (!runCommand('docker', ['compose', 'up', '-d', '--wait'])) {
    stopWith('could not start the test database. Is Docker running? Then run: npm run db:up');
  }

  announce('Preparing the test database');
  if (!runCommand('npm', ['run', 'db:migrate:test'])) stopWith('the migrations failed on the test database.');

  console.log('\nAll set. Next:');
  console.log('  npm test                run the tests');
  console.log(
    '  npm run db:migrate      apply the migrations to your development database (DATABASE_URL), when you want to',
  );
  console.log('  npm run dev             start the app');
}

// Run only when started as a command, not when a test imports the helper above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runSetup();
