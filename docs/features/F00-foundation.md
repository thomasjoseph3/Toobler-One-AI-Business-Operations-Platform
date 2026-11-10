# F00: Foundation and design system

**Requirements:** `1-foundation/01-project-setup.md`; docs/ARCHITECTURE.md, BACKEND.md, FRONTEND.md, SECURITY.md, DEPENDENCIES.md; designer's Design System v1.0
**Depends on:** nothing      **Module:** `core.kernel` (infrastructure, not a business feature)

## Scope
- In: monorepo and tooling; API kernel (config, logging, errors, database with the account fence, module registry and
  guard, event outbox, job runner, health); first migration; lint rules for the layers and module boundaries; test
  database in Docker (Postgres 17; Mailpit joins with F01); CI; `gate` and `verify`; design tokens and first UI components; staff-app shell with placeholder
  pages; `/dev/ui` gallery.
- Out: accounts, users, sign-in (F01), real modules and `account_modules` (F03), any CRM table, monitoring alerts to the
  platform team (F35), staging deploy (needs hosting, review item R14).

## Reused from the hotel agent
- Read: `src/db.js`, `src/config.js`, `src/middleware/{error,validate,rateLimit,requestLog}.js`, `src/utils/errors.js`,
  `src/jobs.js`, `src/app.js`, `src/server.js`, `eslint.config.js`, `eslint.industries.js`, `test/setup.js`,
  `test/e2e/harness.js`, `db/migrations/001_initial.sql` (security part), `admin/src/app/globals.css`.
- **Reused as is (ported to TypeScript):** the account fence (`forAccount`: run as the no-bypass role with the account
  set), RLS policy on `account_id`, `app_user` role with no `BYPASSRLS`, error shape `{error:{code,message,details}}`,
  request id header and one JSON log line per request without query strings, the "heartbeat per job feeds /health"
  idea, advisory-lock single-runner for sweeps, the layering lint rules, the path-based boundary lint rule, the
  rule that tests set their own environment.
- **Changed:** the fence sets role and account **inside each transaction** (`SET LOCAL ROLE` + `set_config(..., true)`),
  not once per pooled connection, so no state leaks between requests behind a pooler. Config is validated by zod and the
  server refuses to start on a bad production config. Tests run on a local Docker Postgres, never on the Supabase
  database. Rate limits use `@fastify/rate-limit`. Boundary rule enforces module kinds (core / engines / channels /
  features) instead of industries.
- **Left behind:** industry modules, booking holds, the MCP/Gemini/OpenAI/payment settings in config (they arrive with
  their features), LangChain, in-process express limiter.

## Database (migration `001_kernel.sql`)
Schema `app`; role `app_user` (NOLOGIN, no BYPASSRLS) with default privileges on the schema;
`app.current_account_id()`; `app.set_updated_at()`; `app.enable_tenant_rls(table)` (enable + force RLS, policy
`account_id = app.current_account_id()`); tables `domain_events` (outbox) and `activity_log` (append only for `app_user`).
The migration runner itself creates the schema and `app.schema_migrations` (with checksums). No extensions yet (each feature adds the ones it needs).

## API
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Public | Database answers and the job runner's heartbeat is fresh. 503 otherwise. Listed in `public-routes.ts`. |

## Screens (`apps/web`)
- App shell: rail 220–240 px on desktop, compact rail on tablet, bottom bar + More sheet on phone, 56 px top bar.
- Placeholder pages with empty states for Today, Leads, Contacts, Companies, Inbox, Tasks, Tickets, Reports, Knowledge
  base, Channels, Settings.
- Theme: follows the system, switch in the top bar (Light / Dark / System).
- `/dev/ui` (development only): every component in both themes.

## Rules to enforce
- A route importing a repository fails lint. Core importing an engine/channel/feature fails lint. Another module's
  internals (anything but `index`) fail lint.
- A table with `account_id` and no forced RLS policy fails the schema test.
- A query run without an account in the fence returns nothing; with account A it never returns account B's rows.
- The server refuses to start in production with a missing or weak secret.
- Logs never contain the fields in the redaction list.
- Every token pair we use is checked for contrast; the five known designer exceptions are listed, anything new fails.

## Tests
- Unit: config parsing and production checks, error mapping, redaction, module registry (active/inactive, `requires`),
  event dispatcher (at-least-once, retry), contrast pairs.
- API (`app.inject`, Docker Postgres): health up/down; 404 shape; 400 validation shape; a test module's route is 404 when
  its module is off; request id header.
- Isolation: fence test on a probe table (no account → 0 rows, A never sees B, insert for B from A refused);
  schema test over every table.
- Lint fixtures: the three forbidden imports are each reported.
- E2E (Playwright, phone and desktop): shell renders, navigation works, theme switch changes tokens, no console errors.

## Manual test script
1. `nvm use` (Node 26.13), `npm run setup`, `npm run dev`.
2. Open http://localhost:3000 at desktop width: rail on the left, Today page with an empty state. Click each menu item.
3. Narrow the window below 768 px: bottom bar with Today, Leads, Inbox, Tasks, More. Open More.
4. Press the theme button in the top bar to go Light, Dark, System; open `/dev/ui` in each.
5. `curl http://localhost:4000/api/v1/health` → `{"ok":true,...}`. Stop the test database and it returns 503.
6. Add `import './repository'` to any `routes.ts` and run `npm run lint`: it fails with the layering message. Remove it.
7. `npm run verify` is green.

## Security checklist
- [ ] Every new table has account_id, RLS enabled + forced, and the schema test passes (n/a for global tables, listed)
- [ ] Every new route: guarded; tests (health is public by design, in public-routes.ts)
- [ ] No business id taken from body, query, params or tool arguments (no business routes yet)
- [ ] All input validated with zod
- [ ] Public route listed in public-routes.ts with a reason, rate-limited
- [ ] Nothing logged that is personal data or a secret (redaction test)
- [ ] Secrets only in env, validated at start-up; `.env` ignored by git
- [ ] Dependencies vetted (`npm run vet`), exact, no install scripts, `npm audit` clean
- [ ] `npm run verify` passes

## Decisions and differences from the requirements
- Node 26 LTS, TypeScript, Fastify 5, Kysely on `pg` (typed queries; SQL stays visible in repositories), pg-boss for
  scheduled and retried jobs, plain polling for the event dispatcher, with a per-event lease (`FOR UPDATE SKIP LOCKED` + `locked_until`) instead of an advisory lock, because a session lock does not survive a transaction pooler such as Supabase's.
- The dev app talks to the Supabase database from `.env` (owner confirmed dev only); tests use the Docker database.
- Contrast: designer's values used unchanged (owner decision).
