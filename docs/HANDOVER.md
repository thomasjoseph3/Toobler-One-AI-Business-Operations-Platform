# Handover: how to carry on from another machine

Written 18 Nov 2026 so work can continue from a fresh clone (for example a Windows machine) with a new Claude Code session.
The rules are in `CLAUDE.md`; the plan and status are in `docs/plan/STATUS.md`. This file holds what is **not** written anywhere else.

## Where things stand

- **Approved and committed:** everything up to and including **F13 Duplicates and merging** (and the UI rebuild, tasks, teams, companies, custom fields, scoring, views, import and export).
- **F21 Inbox, staff takeover and live updates:** built on branch `feature/F21-inbox-and-takeover`, verify green, committed at the end of the session (see `git log`). Its brief is `docs/features/F21-inbox-and-takeover.md`. The owner has not yet clicked through it, so treat it as `in_review` and ask for feedback.
- **Left (in the order proposed):** F22 Today, F23 Staff alerts and morning summary, F25 WhatsApp, F26 Email, F24 Privacy and support access, F27 Follow-ups, F28 Reports, F29 Phone calls, F30 Staff assistant and MCP, then F32 free check, F33 competitor report, F34 billing, F35 platform console, F36 go live.
- To resume: open Claude Code in the project and say "continue". It reads `docs/plan/STATUS.md`, starts the next planned feature with the `feature` skill, and works through brief, migration, backend, front end, all tests, `npm run verify`, hand-off.

**Verify state when this was pushed (18 Nov 2026):** the last full `npm run verify` had all unit/API tests green (2,978) and 781 of 782 browser tests; the one failure was a flaky test in `e2e/inbox.spec.ts` (two filter clicks within milliseconds). It was fixed (the Inbox now reads the address at click time) and a repeat run was started but not read before pushing. **First thing to do on the new machine: run `npm run verify` and fix anything red** before starting F22.

## Set-up on a new machine (Windows notes)

1. Clone the repo and check out `dev`. Clone the old project **next to it** (folder `hotel agent` beside `lead-engine-good`): `https://github.com/thomasjoseph3/booker.git`. F25 (WhatsApp) and F26 (email) are ported from it, and CLAUDE.md's "reuse check" reads it. Read the old code for an area at the start of that feature.
2. Node: the version in `.nvmrc` (use nvm-windows). `npm install`.
3. Docker Desktop for the local test database: `npm run db:up`, then `npm run db:migrate:test`.
4. `.env`: the owner has it; it is never committed. `npm run setup` makes a fresh one. **Never run tests against `DATABASE_URL`** (Supabase); tests use `TEST_DATABASE_URL`.
5. `npx playwright install` once for the browser tests.
6. Use Git Bash or WSL if a script assumes a Unix shell.
7. Run `npm run verify` once to prove the machine is set up: it must be green before any hand-off.

## How the owner likes to work (not all of this is in CLAUDE.md)

- One feature at a time. Since 18 Nov 2026 a feature is **one unit** (brief, migration, backend, front end, all tests, verify, hand-off); the old two-routes-at-a-time rule is gone.
- **Standing instruction:** carry on to the next feature without waiting for approval, unless a real product decision is needed (then ask, with a recommendation, in plain words).
- Commit locally as logical commits (message ends with the Co-Authored-By line). **Pushing and merging need the owner's word**; they asked on 18 Nov 2026 for everything to be pushed to `dev`.
- The owner is learning TypeScript: full descriptive names, a comment on every function, simple explicit code.
- Plain English in explanations; give the owner exact steps to test (browser and Postman).
- Never kill processes you don't know (the owner runs other apps, e.g. port 3100); use unusual ports for tests; never run two test runs at once against the test database (it makes hundreds of tests fail).
- Every feature file in `docs/features/` starts with a plain-English **Feature guide** (F18's is the model).

## Owner decisions that are only recorded here or in REQUIREMENTS-REVIEW.md

- **F13:** a merge is refused when both contacts have an open lead (R79).
- **F21:** "Answered from" links are deferred (the agent does not save its sources yet); replies work on web chat only; the live stream reads the event outbox every 2 seconds (R80).
- **F29 Phone calls:** build the **web call** (browser voice) first. Write the **phone** code with **Twilio** in mind (adapter, webhooks, number set-up, each business's own encrypted keys) behind the same channel interface, but leave it unconnected until the owner sets up a Twilio account.
- **F25 WhatsApp and F26 Email** are already working in the old project: port them to TypeScript and to our `ChannelAdapter` / conversation-engine design (don't copy industry-specific code paths). Real provider connections need accounts and keys from the owner.
- Web call, WhatsApp and phone run on **each business's own encrypted keys** (decided 11 Nov 2026).
- The dev database (Supabase) may be used for ordinary reads and writes through the repo's own commands; demo data was allowed on 13 Nov 2026.

## Useful commands

`npm run dev` (API on 4000, web on 3000) · `npm test` · `npm run e2e` · `npm run verify` · `npm run gate` ·
`npm run db:migrate:test` · `npm run conversation:simulate` · `npm run duplicates:detect -- --email <manager email>`.
