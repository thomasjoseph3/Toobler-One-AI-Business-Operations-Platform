# F00: Foundation and design system

**Requirements:** `1-foundation/01-project-setup.md`; docs/ARCHITECTURE.md, BACKEND.md, FRONTEND.md, SECURITY.md, DEPENDENCIES.md; designer's Design System v1.0
**Depends on:** nothing      **Module:** `core.health` (infrastructure, not a business feature)

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

Your development servers can keep running: the web app on http://localhost:3000 and the API on http://localhost:4000.

1. **Setup (safe to repeat):** `nvm use` then `npm run setup`. It checks Node, `.env`, packages, and the Docker test database.
2. **Desktop look:** open http://localhost:3000 with the window wide. You should see the side menu on the left and the page
   "Good morning" (or afternoon/evening) with today's date. Click **Set up channels**: you land on Channels.
3. **Every page:** click each of the 11 menu items. Each has its own title, its own empty state and a "What you will see
   here" panel. The current item is highlighted.
4. **Window sizes:** narrow the window below 768 px: the bottom bar appears (Today, Leads, Inbox, Tasks, More) and there is
   no sideways scrolling. Open **More**, choose Reports: the sheet closes. Between 768 and 1279 px the menu folds to icons.
5. **Theme:** press the round button at the top right. It cycles System, Light, Dark. While in Dark, reload the page: it
   must not flash white first. Open http://localhost:3000/dev/ui in each theme (a gallery of every component).
6. **Keyboard:** reload and press Tab once: a "Skip to content" link appears. Press Enter: focus moves to the page.
7. **API:** `curl -i http://localhost:4000/api/v1/health` returns `{"ok":true}` with an `x-request-id` header and security
   headers. `curl http://localhost:4000/api/v1/nothing` returns the standard error shape `{"error":{"code":"NOT_FOUND",...}}`.
8. **A rule being enforced:** add the line `import './repository';` to the end of
   `apps/api/src/modules/core/health/routes.ts` and run `npm run lint`. It fails with "Routes call the service". Undo with
   `git checkout apps/api/src/modules/core/health/routes.ts`.
9. **The one-feature gate:** `npm run gate` says F00 is in review. Change F01 to `in_progress` in `docs/plan/STATUS.md`
   and run it again: it fails because F00 is not approved. Undo with `git checkout docs/plan/STATUS.md`.
10. **Everything:** `npm run verify` finishes green (gate, formatting, lint, types, 117 unit and API tests, 94 browser tests).

Not manually testable against your cloud database, and covered by automatic tests instead: `/health` returning 503 when
the database is down, and one business never seeing another's rows.

## Security checklist
- [x] Every new table has account_id, RLS enabled + forced, and the schema test passes (`domain_events`, `activity_log`;
      `schema_migrations` is the one global table, on the test's allow-list)
- [x] Every new route: guarded; tests. The only route is `/health`, public by design, listed in `public-routes.ts`. The
      guard refuses to start the app if any route lacks an access declaration (tested), and 401/403/404 rules are tested with probe routes.
- [x] No business id taken from body, query, params or tool arguments (there are no business routes yet; the account fence
      takes the id only from the context)
- [x] All input validated with zod (settings at start-up; routes validate with the zod type provider; `/health` takes no input)
- [x] Public route listed in public-routes.ts with a reason, rate-limited (300 a minute per address)
- [x] Nothing logged that is personal data or a secret (redaction list and a test that scans the log output; the query
      string is never logged; only the short error message is kept on failed events)
- [x] Secrets only in env, validated at start-up; `.env` is ignored by git (checked: only `.env.example` is tracked);
      production refuses to start on a missing HTTPS or SSL setting (tested)
- [x] Dependencies vetted (`npm run vet`), exact versions (no `^` or `~` anywhere), `npm audit --audit-level=high` clean,
      signatures verified. One package (`esbuild`) declares an install script; `ignore-scripts=true` stops it running and
      everything builds without it.
- [x] `npm run verify` passes

## Decisions and differences from the requirements
- Node 26 LTS, TypeScript 6.0.3 (not 7: typescript-eslint supports below 6.1 only), Fastify 5, Kysely on `pg` (typed
  queries; SQL stays visible in repositories), pg-boss for scheduled and retried jobs, plain polling for the event dispatcher,
  with a per-event lease (`FOR UPDATE SKIP LOCKED` + `locked_until`) instead of an advisory lock, because a session lock does
  not survive a transaction pooler such as Supabase's.
- The dev app talks to the Supabase database from `.env` (owner confirmed dev only); tests use the Docker database.
- Contrast: the designer's values are used unchanged (owner decision). The token test found a fifth exception that the
  first analysis missed (dark selected-menu text, 3.92:1); it is listed in FRONTEND.md section 5.
- Fonts are installed from vetted npm packages and bundled (nothing is loaded from Google).
- Owner's design review (10 Nov 2026): one theme button that cycles System, Light, Dark; each page has its own empty state,
  a preview panel and a real next action. Colours, radii and type are still the designer's.
- Lint also enforces readable names (CLAUDE.md): `ctx`, `tx`, `e` and one-letter names fail the build.

## Known limits and things deferred
- Delivered events are never deleted yet; a nightly clean-up and an alert for events or jobs that give up belong to F35.
- The job heartbeat that feeds `/health` assumes one app instance. Revisit when we run more than one.
- If `DATABASE_URL` is Supabase's transaction pooler (port 6543), pg-boss may complain; the session pooler or a direct
  connection works. (Your current setup works.)
- Hosting is undecided (R14). Design decision recorded: serve the staff app and the API from one address.
- The menu is a fixed list. It becomes data from `GET /me` with the module switches in F03.
- Browser tests run in Chromium only.
