# Go live

**Phase 1 · Launch · HubSpot equivalent: none**

## What it is

Putting the product on its live servers for real businesses, with backups, monitoring and a safe way to release
changes.

## How it works

1. Set up the production servers or cloud account, the domain and HTTPS.
2. Set up the production database with daily backups, and test a restore.
3. Fill in the production settings (keys for Meta, the phone provider, the AI models, Razorpay).
4. Set alert contacts, error tracking and an outside uptime check.
5. Release from `main` through the deploy workflow.
6. Onboard the first three real businesses with our team watching.

## Rules

- Changes reach production only through a checked merge from `dev` to `main`, with all tests passing.
- The production database holds only real businesses' data.
- A failed release can be rolled back to the previous version in minutes.

## Done when

- [ ] The live site works on its own domain with HTTPS.
- [ ] A test release goes from `dev` to production through the workflow, and a rollback works.
- [ ] Database backups run daily and a restore has been tested.
- [ ] Uptime check, error tracking and alerts are on.

## For developers

- **Files:** `.github/workflows/deploy-production.yml`, infrastructure settings for the chosen host.
- **API:** `GET /health` for the uptime check (see [API.md](../../API.md), Phase 1 → Platform console).

## Open questions

- Hosting: a single server (simple, cheap) or a cloud platform (scales without effort)? Decide before step 9.
