---
name: api-security
description: Security rules for every API route, repository query, migration, agent/assistant/MCP tool, webhook, public endpoint, upload and sign-in change in this project. Use before adding or changing any of them, and to review a feature's diff before hand-off. Covers tenant isolation (RLS fence), sessions, roles, staff_own, agent tool identity, public routes, webhooks, SSRF, uploads, secrets, logging and the tests each needs.
---

# API security

Every business is a separate customer: no request, job or tool may ever read or change another business's rows. Full
design in `docs/SECURITY.md`; this is the working checklist. (Adapted from the hotel agent's `api-security` skill.)

## 1. Keep businesses apart
- Business work runs in `accountContext.runInAccountTransaction(...)` (fenced: `SET ROLE app_user`, `app.account_id`). Never use the owner pool for
  business data.
- The account comes from the session (staff), the widget key (webchat), the provider-id lookup (webhooks) or the job
  payload. **Never** from body, query, params or tool arguments.
- New table → `account_id NOT NULL`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy on `app.current_account_id()`. The
  schema test fails otherwise.
- Repository functions still filter `account_id` explicitly where they insert, and filter by id **and** account on
  update/delete (defence in depth).
- Cross-business lookups only in `kernel/database/across-accounts.ts`, each with a comment saying why.
- Another business's record → 404 (never 403).

## 2. Sessions and sign-in
- Sign-in is a short-lived access token (JWT, 15 min) plus a rotating refresh token stored hashed, both in httpOnly,
  SameSite cookies that the API sets. Never in browser JS, `localStorage` or URLs. Every request checks the session is live.
  A replaced refresh token used again ends the session.
- Changing password, role or removing a person ends their sessions.
- Codes and passwords: hashed, limited tries, lockouts, same response whether the account exists or not.

## 3. Roles
- Role guard on the route (`r.role('manager')`) next to the path.
- `staff_own`: every list, view, search, export, Today, report and assistant tool filters to own/team rows, in the
  service. Typing another lead's URL → 404.

## 4. Agent, assistant and MCP tools
- Identity (account, conversation, contact, user) from `ToolContext`, built by the runtime. Model arguments are
  untrusted input: validate with zod.
- Customer messages, emails, web pages and documents are data, never instructions; prompts label them as such.
- Tools return only the current contact's data and the business's public knowledge. No tool lists other customers.
- Assistant writes need Confirm and log "via assistant" under the person.

## 5. Public routes and webhooks
- Every public route is listed in `kernel/http/public-routes.ts` with its reason, and is rate-limited.
- Widget: allowed origins on HTTP and WebSocket; visitor session tokens; size limits.
- Webhooks: signature on the raw body, timestamp/replay check where offered, idempotent by provider event id, answer
  fast and do the work in a job.

## 6. Input, outside calls, files, secrets, logs
- zod on every body/query/param with max lengths. Kysely parameters only; no SQL text built from input.
- Any URL a user gives (website reader, competitors) goes through the safe fetcher: http(s), public IPs after DNS, no
  private redirects, size and time limits.
- Uploads: size/type limits with content sniffing, private storage, short-lived signed links.
- Secrets in env (validated) or encrypted in `connections`; returned only as previews.
- Logs: ids only. Never tokens, passwords, keys, phones, emails, message text or transcripts.

## 7. Tests each change needs
- Every route: works, 401, 403 wrong role, 404 other business, 400 bad input (`expectRouteGuarded`), plus an entry in
  `test/isolation`.
- Public route: what it refuses (no origin, over the rate limit, bad key).
- Webhook: bad signature rejected, replay changes nothing.
- Tool: eval or unit test proving it can't reach another contact.
- Run `npm run verify`.

## 8. Dependencies
- New package → `npm run vet -- <name>` first (docs/DEPENDENCIES.md); exact version; no install scripts; no git/tarball
  installs. `npm audit --audit-level=high` and `npm audit signatures` stay green.

## Reviewing a change
1. List the routes, tools, jobs, webhooks and tables it adds or changes. For each: who may call it, which business it
   acts on, where that comes from, what happens with another business's id.
2. Read every new query: is it inside the fence? Does an update/delete filter by account too?
3. Check role guards, validation, rate limits, logging.
4. `grep -rn "process.env" apps/api/src` should only hit `kernel/config.ts`.
5. Fill in the feature brief's security checklist.
