# Project setup

**Phase 1 · Foundation · HubSpot equivalent: none (groundwork)**

## What it is

The starting point every other feature is built on: the code repository with its apps, the database, automatic tests,
and a staging copy where the team checks work before customers see it.

## Why it matters

Getting this right at the start makes every later feature faster to build and safer to release. Getting it wrong
means rework in every phase.

## How it works

1. Create one repository with the apps described in [ARCHITECTURE.md](../../ARCHITECTURE.md): API, staff app, public
   site, MCP server, and shared packages.
2. Set up the database with Row Level Security from the first table, and a numbered migration for every change.
3. Set up tests: unit, API, click-through and agent evals, all run automatically on every push.
4. Set up three environments: local, staging and production, each with its own database and settings.
5. Add error tracking and logs from day one.

## Rules

- Every table has `account_id` and a Row Level Security policy from its first migration.
- Secrets live only in environment settings, never in the repository.
- No demo data in staging or production. Developers use a script that fills a local database only.
- A change reaches production only through a checked merge from `dev` to `main` with all tests passing.

## Done when

- [ ] A new developer can clone the repository and run every app locally with one command.
- [ ] Pushing a change runs lint, type checks and all tests automatically.
- [ ] Merging to `dev` deploys to staging.
- [ ] A test proves a query without the business set returns nothing.

## For developers

- **Code folders:** `apps/api`, `apps/web`, `apps/site`, `apps/mcp`, `packages/shared`, `packages/ui`, `db/migrations`.
- **Database:** PostgreSQL; first migration `001_accounts_users.sql` (accounts, users, memberships, sessions) with the
  Row Level Security helper `current_account_id()`.
- **Tests:** Vitest (unit and API, each run in a throwaway database), Playwright (click-through), `npm run eval:agent`
  (scripted conversations).
- **CI:** `.github/workflows/ci.yml` (every push), `deploy-staging.yml` (merge to `dev`), `deploy-production.yml`
  (merge to `main`).
- **API:** none.

## Open questions

- Product name, so the repository and domain can be named.
