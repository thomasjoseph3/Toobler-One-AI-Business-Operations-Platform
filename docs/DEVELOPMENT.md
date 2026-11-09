# How we build: one feature at a time

The rule: **one feature is built end to end (database, backend, front end, tests), verified, and handed to the owner.
The next feature starts only after the owner says it is approved.** This page is the process; `CLAUDE.md` and the
`feature` skill enforce it.

## Feature states

```text
planned ──start──► in_progress ──verify──► in_review ──owner: "approved"──► approved
                        ▲                      │
                        └── owner: changes ────┘
```

- `docs/plan/STATUS.md` is the single source of truth. **At most one feature is `in_progress` or `in_review`.**
- A feature can only start when every feature before it in the plan is `approved` (or the owner explicitly marked it
  `deferred`).
- `npm run gate` checks both rules and runs as part of `npm run verify`.

## The steps for each feature

### 0. Reuse check (before the brief)
Read the hotel agent's implementation of this feature's area (paths in the "Port from" table in
[PHASE-1.md](plan/PHASE-1.md)) and nothing beyond it. Note what is reused as it is (ported to TypeScript), what
changes for our module and channel design, and what is left behind. Decisions that differ from
[ARCHITECTURE.md](ARCHITECTURE.md) go to the owner first.

### 1. Brief (before any code)
Write `docs/features/Fxx-<name>.md` from the template below, using the requirement files the plan lists. If the brief
needs to differ from the requirements (a gap, a conflict, a better way), **ask the owner first** and record the answer
in the brief and in [REQUIREMENTS-REVIEW.md](REQUIREMENTS-REVIEW.md).

### 2. Database
One numbered migration per change (`db/migrations/NNN_<module>_<what>.sql`), with `account_id`, RLS and indexes.
Apply to the test database; the schema test must pass.

### 3. Backend
Repository → service → routes, inside the module folder, registered by its manifest. Unit tests for pure logic, API
tests for every route (works, 401, 403, 404 other business, 400), isolation entries for every route.

### 4. Front end
Screens from the brief, phone first, using `packages/ui`. Playwright tests at phone and desktop sizes for the main
flows.

### 5. Verify
- `npm run verify` is green (gate, lint, types, unit, API, isolation, the feature's e2e).
- Run the apps (`npm run dev`) and walk the brief's **manual test script** in a real browser at phone and desktop size,
  light and dark. Take screenshots.
- Tick the [security checklist](SECURITY.md#3-feature-security-checklist) in the brief.

### 6. Hand-off (then stop)
Post to the owner:
1. What was built (endpoints, screens, tables) in a few lines.
2. **How to test it yourself**: numbered steps with what you should see, including the logins to use.
3. Test results (counts), screenshots, the ticked security checklist.
4. Anything that differs from the requirements, known limits, and anything deferred.

Set the feature to `in_review` and **wait**. Do not start the next feature, and don't "prepare" it either.

### 7. Approval
- **"Approved"** → set `approved` with the date, commit the feature on its branch (`feature/Fxx-<name>`), merge to
  `dev` when the owner wants.
- **Changes requested** → back to `in_progress`, fix, re-verify, hand off again.

## Brief template (`docs/features/Fxx-<name>.md`)

```markdown
# Fxx: <name>

**Requirements:** <links to the requirement files>
**Depends on:** <features>      **Module:** <module id, kind>

## Scope
- In: …
- Out (later feature / phase): …

## Reused from the hotel agent
- Read: <old paths>. Reused: … Changed: … Left behind: …

## Database
Migration NNN: tables, columns, indexes, RLS.

## API
| Method | Address | Who | Notes |

## Screens
- <screen>: what is on it, actions, empty state, phone layout.

## Rules to enforce
- …

## Tests
- Unit: …
- API: … (every route: works / 401 / 403 / 404 other business / 400)
- E2E: …

## Manual test script
1. … → you should see …

## Security checklist
(copied from docs/SECURITY.md)

## Decisions and differences from the requirements
- …
```

## Branches and environments

| Branch | What | Database |
| --- | --- | --- |
| `feature/Fxx-name` | one feature | local throwaway (tests), Supabase dev (running app) |
| `dev` | approved features | staging (once hosting is decided) |
| `main` | released | production, real businesses only |

## Commands (defined in Foundation, F00)

| Command | Does |
| --- | --- |
| `npm run setup` | Install, create `.env` files from examples, start the Docker test database and Mailpit |
| `npm run dev` | API, worker, staff app, public site (and MCP once built) |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed:local` | Local demo data, **refuses** to run against a non-local database |
| `npm test` | Unit + API tests on the throwaway database |
| `npm run e2e` | Playwright at phone and desktop sizes |
| `npm run eval:agent`, `npm run eval:types` | Agent and classification evals (real model, needs keys) |
| `npm run gate` | Checks the one-feature-at-a-time rules in STATUS.md |
| `npm run verify` | gate + lint + typecheck + test + e2e: must be green before a hand-off |
