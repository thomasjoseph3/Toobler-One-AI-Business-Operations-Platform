# Backend design guide

How to write code in `apps/api`. The layering and the fence come from the hotel agent (`hotel agent/docs/ARCHITECTURE.md`),
moved to TypeScript and Fastify. Most rules here are enforced by ESLint or tests; the rest are checked in review.

## 1. Layers (repository pattern)

```text
routes.ts       HTTP only: schema (zod), auth + role guard, call ONE service function, shape the response.
   │            No business rules. No SQL. Never imports a repository.
   ▼
service.ts      Business rules, orchestration, transactions, events, audit. The module's public face.
   │            Other modules call it through the module's index.ts (only if listed in `requires`).
   ▼
repository.ts   Database reads and writes, private to its module. Functions named for intentions
   │            (`findByPhoneKey`, `moveToStage`, `claimHold`), returning plain typed records.
   ▼
kernel/db       Kysely + pg, the account fence, transactions.
```

| Rule | Enforced by |
| --- | --- |
| Only `repository.ts` (and `kernel/db`) imports the database | ESLint `no-restricted-imports` |
| `routes.ts` never imports `./repository` | ESLint |
| No module imports another module's `repository`, `service` or internals; only its `index.ts`, and only if `requires` lists it | ESLint boundaries rule + a registry test |
| Core never imports engines, channels or features | ESLint boundaries rule |
| Pure logic (scoring, router, completeness, report maths, phone keys) lives in its own file with no I/O | Review; unit tests need no database |

### A module's files

```text
modules/core/contacts/
  module.ts          the manifest (id, kind, requires, routes, events, jobs, …)
  index.ts           the public API other modules may use: re-exports chosen service functions and types
  routes.ts          endpoints
  service.ts         rules
  repository.ts      SQL
  schemas.ts         zod schemas for this module's requests (shared ones live in packages/shared)
  phone.ts           a pure helper (example)
  contacts.test.ts   unit tests of pure logic
  contacts.api.test.ts  API tests: works, wrong role, other business, not signed in, bad input
```

### Example

```ts
// routes.ts
export const contactRoutes: ModuleRoutes = (r) => {
  r.post('/contacts', { schema: { body: ContactCreate, response: { 201: Contact } }, preHandler: r.role('staff') },
    async (req, reply) => reply.code(201).send(await contacts.create(req.ctx, req.body)));
};

// service.ts
export async function create(ctx: RequestCtx, input: ContactCreate): Promise<Contact> {
  const phoneKey = input.phone ? toPhoneKey(input.phone) : null;          // pure helper
  return ctx.runInAccountTransaction(async (db) => {
    if (phoneKey && (await repo.findByPhoneKey(db, phoneKey))) throw conflict('CONTACT_EXISTS', 'A contact already has this phone number.');
    const contact = await repo.insert(db, { ...input, phoneKey, lifecycleStage: 'new', createdBy: ctx.actor });
    await ctx.audit(db, 'contact.created', { contactId: contact.id });
    await ctx.publish(db, 'contact.created', { contactId: contact.id });
    return contact;
  });
}

// repository.ts  (runs inside the account fence; account_id is still written explicitly)
export const findByPhoneKey = (db: Db, phoneKey: string) =>
  db.selectFrom('contacts').selectAll().where('phone_key', '=', phoneKey).where('deleted_at', 'is', null).executeTakeFirst();
```

## 2. Request context and the account fence

Every authenticated request gets `req.ctx: RequestCtx`:

| Field | Meaning |
| --- | --- |
| `accountId` | The signed-in person's **current business**, from the session. Never from the URL, body or query. |
| `user` | id, name, role in this business (`manager`, `staff`, `staff_own`), team ids |
| `actor` | Who is acting, stamped on every change: `{ kind: 'user' \| 'agent' \| 'assistant' \| 'import' \| 'system' \| 'workflow', id }` |
| `runInAccountTransaction(fn)` | Runs `fn` in a transaction **fenced to the account** (RLS: `SET ROLE app_user`, `app.account_id`) |
| `audit(db, kind, data)` | Writes the activity log in the same transaction |
| `publish(db, event, payload)` | Writes the outbox event in the same transaction |
| `modules` | The active modules for this business (cached per request) |

Background jobs, webhooks and the agent build the same context with `kernel.contextFor(accountId, actor)`; nothing
does business work outside a fenced context. The few cross-business lookups (which business owns this WhatsApp
number?) are named repository functions marked `acrossAccounts`, listed in [SECURITY.md](SECURITY.md).

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

- Publish inside the same transaction as the change (`ctx.publish`). Never call another module to "tell" it something.
- Subscribers are idempotent; they get `{ eventId, accountId, name, payload, occurredAt }` and run fenced to the account.
- Jobs are named `<module>.<what>` (`tasks.remind`, `knowledge.read_document`). Scheduled jobs that loop over businesses
  enqueue one job per business, so one slow business never blocks the others.
- Retries with backoff; after the last failure, an alert to the platform team (monitoring).

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
