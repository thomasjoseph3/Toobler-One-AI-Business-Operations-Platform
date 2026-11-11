# Commands

Run these from the project folder (`lead-engine-good`). Use `nvm use` first so Node is the right version.

## Start and stop

| Command                    | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `npm run setup`            | First-time setup: creates your `.env` with a fresh secret and installs what is needed |
| `npm run db:up`            | Starts the local test database (Docker)                                       |
| `npm run db:down`          | Stops the local test database                                                 |
| `npm run dev`              | Starts the API (port 4000) and the web app (port 3000), restarting on every change |
| `npm run dev -w @toobler-one/api` | Starts only the API, restarting on every change                        |
| `npm run dev -w @toobler-one/web` | Starts only the web app                                                |
| `npm run start -w @toobler-one/api` | Starts the API once, without restarting on changes                   |
| `npm run build`            | Builds the web app for production                                             |
| `npm run preview -w @toobler-one/web` | Serves the built web app locally to look at it                     |

## Database

| Command                    | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `npm run db:migrate`       | Applies new migrations to the development database (Supabase). Only when told to apply |
| `npm run db:migrate:test`  | Applies the migrations to the local test database                             |

## Tests and checks

| Command                    | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `npm test`                 | Runs the unit, integration and journey tests (local test database)            |
| `npx vitest run <file>`    | Runs one test file, for example `npx vitest run apps/api/test/auth-journeys.test.ts` |
| `npm run e2e`              | Runs the browser tests (Playwright)                                           |
| `npm run lint`             | Checks the code for mistakes and broken rules (ESLint)                        |
| `npm run typecheck`        | Checks every TypeScript file for type errors                                  |
| `npm run format:check`     | Checks that all files are formatted (does not change anything)                |
| `npm run format`           | Formats all files with Prettier                                               |
| `npm run gate`             | Checks that only the feature marked `in_progress` is being worked on          |
| `npm run verify`           | Runs everything above in order (gate, format, lint, types, tests, browser tests). Must be green before hand-off |

## Packages

| Command                    | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `npm run vet -- <package>` | Checks a package is safe and well known before we install it                  |
| `npm run audit:deps`       | Checks installed packages for known security problems                         |

## Git (our flow)

| Command                                 | What it does                                           |
| --------------------------------------- | ------------------------------------------------------ |
| `git checkout -b feature/Fxx-name dev`  | Starts a new feature branch from `dev`                 |
| `git status -sb`                        | Shows the branch and which files changed               |
| `git log --oneline -5`                  | Shows the last 5 commits                               |
| `git push origin <branch>`              | Pushes a branch to GitHub                              |
