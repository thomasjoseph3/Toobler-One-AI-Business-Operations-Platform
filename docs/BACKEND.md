# Backend design guide

How to write code in `apps/api`. The layering and the fence come from the hotel agent (`hotel agent/docs/ARCHITECTURE.md`),
moved to TypeScript and Fastify. Most rules here are enforced by ESLint or tests; the rest are checked in review.

## 1. Layers (repository pattern)

```text
routes/          HTTP only: schema (zod), auth + role guard, call ONE service function, shape the response.
   │            No business rules. No SQL. Never imports a repository.
   ▼
services/        Business rules, orchestration, transactions, events, audit. The module's public face.
   │            Other modules call it through the module's index.ts (only if listed in `requires`).
   ▼
repositories/   Database reads and writes, private to its module. Functions named for intentions
   │            (`findByPhoneKey`, `moveToStage`, `claimHold`), returning plain typed records.
   ▼
kernel/database       Kysely + pg, the account fence, transactions.
```

| Rule | Enforced by |
| --- | --- |
| Only repository files (and `kernel/database`) imports the database | ESLint `no-restricted-imports` |
| a routes file never imports a repository | ESLint |
| No module imports another module's `repository`, `service` or internals; only its `index.ts`, and only if `requires` lists it | ESLint boundaries rule + a registry test |
| Core never imports engines, channels or features | ESLint boundaries rule |
| Pure logic (scoring, router, completeness, report maths, phone keys) lives in its own file with no I/O | Review; unit tests need no database |

### A module's files: the same shape for every module (decided 10 Nov 2026)

Every module, small or big, uses the same folders. To find routes, open `routes/`; services, `services/`; SQL,
`repositories/`. The feature or table name is in the file name. A folder is created only when the module needs it (a
module with no database has no `repositories/`), and an empty folder is not allowed.

```text
modules/core/contacts/
  module.ts                          the manifest (id, kind, requires, routes, events, jobs, ...)
  index.ts                           optional: the public API other modules may use (re-exports chosen service functions)
  README.md                          optional: layout notes for a big module
  authenticator.ts / adapter.ts      only for modules that provide an authenticator / a channel adapter
  routes/<feature>.routes.ts         HTTP only: check the request, call the service, send the answer
  services/<feature>.service.ts      the rules and the steps
  repositories/<table>.repository.ts ONE per table; the only files that touch the database
  helpers/                           shared tools with no routes (pure logic, e.g. phone.ts + phone.test.ts)
```

`apps/api/test/module-structure.test.ts` checks every module against this shape on every test run and in CI. It fails with
a plain message if a file is in the wrong folder or named wrongly, a folder is empty or unknown, a file sits loose at the
top, or `module.ts` forgets to register a routes file. API tests live in `apps/api/test/`.

The flow: `routes/` -> `services/` -> `repositories/` -> `kernel/database`. A service reaches a repository with a plain
import, e.g. `import * as usersRepository from '../repositories/users.repository'`. A repository is shared by every
feature that needs that table, so SQL is never copied. The linter treats `repository.ts` and `*.repository.ts` as the
files allowed to use the database layer. Folder names must not repeat names used elsewhere in the project (the engine
room is `kernel`, the machinery for modules is `kernel/module-system`).

### Example

```ts
// routes.ts
export const contactRoutes: ModuleRoutes = (r) => {
  r.post('/contacts', { schema: { body: ContactCreate, response: { 201: Contact } }, preHandler: r.role('staff') },
    async (request, reply) => reply.code(201).send(await contacts.create(request.requestContext, request.body)));
};

// service.ts
export async function create(requestContext: RequestContext, input: ContactCreate): Promise<Contact> {
  const phoneKey = input.phone ? toPhoneKey(input.phone) : null;          // pure helper
  return requestContext.runInAccountTransaction(async (transaction) => {
    if (phoneKey && (await repo.findByPhoneKey(transaction, phoneKey))) throw conflict('CONTACT_EXISTS', 'A contact already has this phone number.');
    const contact = await repo.insert(transaction, { ...input, phoneKey, lifecycleStage: 'new', createdBy: requestContext.actor });
    await requestContext.audit(transaction, 'contact.created', { contactId: contact.id });
    await requestContext.publish(transaction, 'contact.created', { contactId: contact.id });
    return contact;
  });
}

// repository.ts  (runs inside the account fence; account_id is still written explicitly)
export const findByPhoneKey = (db: Db, phoneKey: string) =>
  db.selectFrom('contacts').selectAll().where('phone_key', '=', phoneKey).where('deleted_at', 'is', null).executeTakeFirst();
```

## 2. Request context and the account fence

Every piece of business work runs with an `AccountContext` (built in `kernel/context.ts`, built so far by
`kernel.contextFor(accountId, actor)`):

| Field | Meaning |
| --- | --- |
| `accountId` | The business. Fixed when the context is built: from the session, widget key, provider lookup or job data. Never from the URL, body or query. |
| `actor` | Who is acting, stamped on every change: `{ kind: 'user' \| 'agent' \| 'assistant' \| 'import' \| 'system' \| 'workflow', id }` |
| `runInAccountTransaction(work)` | Runs `work` in a transaction **fenced to the account** (RLS: `SET ROLE app_user`, `app.account_id`) |
| `audit(transaction, kind, details)` | Writes the activity log in the same transaction (field names, never values) |
| `publish(transaction, eventName, payload)` | Writes the outbox event in the same transaction |

For web requests, sign-in (F01) turns this into `request.requestContext: RequestContext`, which adds the signed-in person (id, name, role in
this business, team ids) and the active modules. Event handlers get a context with actor `{ kind: 'system', id: <module> }`;
jobs get one with actor `{ kind: 'system', id: <job name> }`. Nothing does business work outside a fenced context. The few
cross-business lookups (which business owns this WhatsApp number?) are named repository functions marked
`acrossAccounts`, listed in [SECURITY.md](SECURITY.md).

## 3. Conventions

| Topic | Rule |
| --- | --- |
| IDs | UUID v7 (`uuidv7()` in the app, sortable by time). An id that isn't a UUID is "not found", not a 500. |
| Not found vs forbidden | Another business's record answers **404**, exactly like a missing one. A wrong role gets **403**. |
| Money | Integer **paise** (`bigint`). Formatting and any sum in code (`money.ts`). The AI never computes. |
| Time | `timestamptz` in UTC. Each business has a time zone (`accounts.time_zone`, default `Asia/Kolkata`) for office hours and display. Dates without time (stay dates) are `date`. |
| Phones | Stored E.164 (`+9198…`) plus `phone_key` = last 10 digits, unique per business. One helper parses every format (+91, 0, spaces, dashes). |
| Emails | `citext`, trimmed, unique per business when set. |
| Who changed it | `created_by` / `updated_by` as actor JSON (`{kind, id}`) on every business table; the activity log records field **names**, never values. |
| Soft delete | Contacts, companies, leads: `deleted_at` (hidden, restorable for 30 days, purged by a job). Erase (privacy) is a hard delete of personal data. |
| Lists | `?page`, `?limit` (≤100), `?sort`, `?filter[field]=` → `{ items, next }` (cursor in `next`). |
| Errors | `{ error: { code, message, details? } }`. `code` is UPPER_SNAKE and stable; `message` is plain English for the screen. Postgres unique/check errors map to 409/400 in one place. |
| Idempotency | Writes accept `Idempotency-Key`; stored per account for 24 h with the response. Webhooks are idempotent by provider event id. |
| Validation | Every body, query and param through zod with max lengths. Custom fields validated by the one shared `validateCustom(defs, values)` used by the API, imports and agent tools. |
| Config | `kernel/config.ts` parses `process.env` with zod at start-up; the server refuses to start in production with a missing or weak secret. No `process.env` anywhere else. |
| Logs | pino, JSON, with a request id. Redacted: authorization, cookies, tokens, passwords, phone, email, message text, transcripts. Log ids, not content. |
| Outside services | Only through `providers/<kind>/` interfaces. Each has a `console` (dev: prints to the log) and a `fake` (tests: records calls) implementation, so nothing real is sent in development or tests unless configured. |

## 4. Events, jobs and the outbox

- Publish inside the same transaction as the change (`accountContext.publish(transaction, 'lead.created', { leadId })`). Never call
  another module to "tell" it something. Event names are `thing.what_happened`; payloads are ids and small facts (max 8,000
  characters), never personal data.
- A module lists what it reacts to in its manifest: `events: { 'lead.created': async (event, accountContext) => ... }`.
  The dispatcher (`kernel/events/`) polls the outbox every second, takes events with a lease (`FOR UPDATE SKIP LOCKED`,
  so several instances never deliver the same event twice at once, and a crashed instance's events are taken over), and
  runs each active subscriber with a context fenced to the event's business.
- **At least once.** If any handler fails, the whole event is tried again after a wait (30 s, 1 m, 2 m ... up to 1 h),
  up to 8 attempts, then it is parked (`failed_at`) for a person to look at. So **handlers must be safe to repeat**
  (use `event.id` to spot work already done), and a handler that already succeeded runs again when its sibling failed.
- A module that is off for a business is skipped for that event (the event is not kept for it; its data is untouched).
- Only a short error message is kept on the event (`last_error`, 300 characters), never database detail text.
- Jobs (`kernel/jobs/`, pg-boss in its own `pgboss` schema) are declared in the manifest: `jobs: [{ name: 'tasks.remind', schedule?: '0 3 * * *', run }]`.
  Names are `<module>.<what>` (checked at start-up). The business goes in the job data (`accountId`); `run` receives a
  fenced `accountContext` for it, and the job is skipped when the module is off for that business. Scheduled jobs that
  loop over businesses enqueue one job per business, so one slow business never blocks the others.
- Jobs retry up to 5 times with a growing wait. The runner also runs `kernel.heartbeat` once a minute; `/health` fails
  when it stops. `/health` also fails when the event dispatcher stops checking.
- Still to do (later features): delete delivered events after 30 days; alert the platform team when an event or job
  gives up (F35 monitoring).

## 5. Agent tools

```ts
export const saveDetails = defineTool({
  name: 'save_details',
  module: 'core.conversations',
  effect: 'writes',
  description: 'Save what the customer told you: name, dates, party size, interest, budget, custom fields, the promise.',
  input: SaveDetailsInput,                                  // zod; the model's arguments are untrusted input
  run: async (tc: ToolContext, input) => conversations.saveDetails(tc, input),
});
```

- `ToolContext` (account, conversation, contact, channel, playbook) is built by the runtime, **never** from arguments.
- A tool returns short plain facts for the model, never internal ids it could misuse, never another customer's data.
- Every tool has a unit test with the fake provider and is covered by an eval conversation.

## 6. Tests

| Layer | Tool | Where | Runs against |
| --- | --- | --- | --- |
| Unit | Vitest | `*.test.ts` next to the code | nothing (pure functions) |
| API | Vitest + `app.inject()` | `*.api.test.ts` | a throwaway Postgres (Docker `pgvector/pgvector:pg17`), fresh schema per test file, migrations applied |
| Isolation | Vitest | `test/isolation/*.api.test.ts` | two businesses; every route with the other's ids gets 404 |
| Click-through | Playwright | `apps/web/e2e` | the running apps on the test database |
| Agent and classification | evals | `evals/` | the real model, on demand and in CI nightly |

Every endpoint has at least: **works**, **wrong role → 403**, **another business → 404**, **not signed in → 401**,
**bad input → 400**. Helpers make this a few lines per route (`expectRouteGuarded(...)`).

The live (Supabase) database is **never** used by tests. `DATABASE_URL` is for the running app; tests use
`TEST_DATABASE_URL`, and the test setup refuses to run if it points at a non-local host.
