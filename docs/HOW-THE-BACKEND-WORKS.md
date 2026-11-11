# How the backend works, in plain words

This file explains how the pieces of `apps/api` fit together: the **kernel**, the **module system**, the **checks every
request goes through**, and the **rules** that keep it safe. It is for learning. When something here disagrees with the
code, the code wins; tell me and I will fix this file.

---

## 1. The big picture

```text
apps/api/src/
├── server.ts        starts everything (database, web server, background workers)
├── app.ts           builds the web server and plugs every module into it
├── kernel/          the base everything stands on. It knows NO module.
├── modules/         the product itself, one folder per module
│   ├── index.ts     the list of all modules (one line per module)
│   └── core/<name>/ auth, health, industries, module-switches ... (later: engines, channels, features)
└── providers/       outside services behind an interface (sending email)
```

Two ideas run through everything:

1. **The kernel is the base and modules are plug-ins.** The kernel provides the plumbing (database, security checks,
   events, jobs). Modules provide the features. The kernel never imports a module, so a module can be added or switched
   off without touching the kernel.
2. **Every business is walled off from every other business.** A business's data is only visible inside "its fence"
   (section 5). A bug in a feature must never be able to show one business another's data.

---

## 2. The kernel, file by file

The kernel is `apps/api/src/kernel/`. Think of it as the building's plumbing and wiring.

| File or folder | What it does |
| --- | --- |
| `config.ts` | Reads the settings (`.env`) once at start-up and checks them. Production refuses to start with a bad or example secret. The only file allowed to read `process.env`. |
| `database/index.ts` | Opens the database and gives two ways to work: **inside a business's fence** (`runInAccountTransaction`) or **across businesses** on the owner connection (`runInSystemTransaction`). |
| `database/types.ts` | The list of tables and their columns, so TypeScript catches a wrong column name. |
| `database/migrate.ts` | Applies the numbered SQL files in `db/migrations/` in order. |
| `errors.ts`, `http/errors.ts` | The standard errors (`notFound`, `forbidden`, `conflict`...) and how they become a clean JSON answer `{ "error": { "code", "message" } }`. |
| `context.ts` | `AccountContext`: "I am working for business X, as actor Y", with helpers to run a fenced transaction, write the activity log and publish an event. Jobs and event handlers start from this. |
| `activity-log.ts` | Adds a line to the append-only "who did what" record. Stores field **names**, never values. |
| `events/` | The **outbox**: a service saves an event in the same transaction as its change; the dispatcher later delivers it to the modules that listen. Delivered at least once, so handlers must be safe to repeat. |
| `jobs/` | Scheduled and queued background work, owned by modules. |
| `http/guard.ts` | The **access guard**: runs before every route (section 4). |
| `http/csrf.ts` | The **CSRF check**: every change (POST, PATCH, DELETE) must carry our `Origin` and the header `X-Requested-With: toobler-web`. |
| `http/public-routes.ts` | The list of routes that need no sign-in, each with a written reason. A public route that is not listed makes the app **refuse to start**. |
| `http/route-limits.ts` | Named rate limits per route (login, reset password...). |
| `module-system/` | The module system itself (section 3). |
| `health.ts` | `GET /health`: up or down, plus the state of the workers. |
| `ids.ts`, `logger.ts` | UUIDs, and logging that hides secrets and personal data. |

**The kernel's one rule:** it never imports anything from `modules/`. A lint rule fails the build if it does.

---

## 3. The module system

### What a module is
A module is a folder in `src/modules/` with a **manifest**, `module.ts`. The manifest says what the module is and what
it offers:

```ts
export default defineModule({
  id: 'core.module_switches',   // <kind>.<name>
  kind: 'core',                 // core | engine | channel | feature
  requires: [],                 // other modules whose public face (index.ts) this one uses
  routes: (app) => { ... },     // the API routes it adds
  events: { ... },              // events it reacts to (later)
  jobs: [ ... ],                // background jobs it owns (later)
  authenticator: ...,           // ONLY core.auth: "who is signed in?"
  moduleGate: ...,              // ONLY core.module_switches: "is this module on for this business?"
});
```

### The four kinds
| Kind | Meaning | Always on? |
| --- | --- | --- |
| `core` | The foundation: sign-in, industries, module switches, later contacts and so on | **Yes** |
| `engine` | A paid bundle, such as the lead engine | Only if the business has it |
| `channel` | A connector, such as website chat or WhatsApp | Only if the business has it |
| `feature` | An add-on, such as follow-ups | Only if the business has it |

### How modules are plugged in
1. `modules/index.ts` lists every module's manifest. **Adding a module is one line there.**
2. At start-up, `kernel/module-system/registry.ts` reads the list and **checks it**:
   - ids look like `kind.name` and the kind matches the id;
   - no two modules share an id;
   - every `requires` points at a module that exists;
   - no circle (A needs B needs A);
   - event and job names are well formed, and each job name starts with its own module's name;
   - only one module provides the authenticator.
   A mistake here stops the app at start-up, not at 3 a.m. in production.
3. It orders modules so that a module's requirements come first.
4. `app.ts` registers each module's routes under `/api/v1` and **tags every route with its module's id**. That tag is
   what the guard uses to answer "is this module on?".

### Why modules never reach into each other
- A module may use another only through that module's `index.ts` (its public face), and only if it lists it in `requires`.
  `core.auth` uses `core.module_switches` and `core.industries` this way.
- Reactions between modules go through **events**, not direct calls: "a lead was won" is published once, and whoever cares
  listens.
- A lint rule (`toobler/module-boundaries`) fails the build when a module breaks these rules. Folder names use hyphens
  (`module-switches`) and the id uses underscores (`core.module_switches`); the rule knows this.

### The same shape inside every module
```text
modules/core/<name>/
├── module.ts          the manifest
├── index.ts           the public face (the only file others may import)
├── README.md          where things live
├── routes/<feature>.routes.ts       HTTP: check the shape of the request, call a service, send the answer
├── services/<feature>.service.ts    the rules and the steps
├── repositories/<table>.repository.ts   the SQL, nothing else
└── helpers/           pure tools (no database), easy to test
```
`routes → services → repositories → database`. **Only repositories touch the database.** A route never calls a
repository. A test (`module-structure.test.ts`) and lint rules enforce this, so every module looks the same.

---

## 4. What happens to one request (the checks, in order)

Example: a manager sends `PATCH /api/v1/modules/channel.webchat` with `{ "enabled": false }`.

```text
1. CSRF check          kernel/http/csrf.ts
   Is the Origin our web app, and is the header X-Requested-With present? No -> 403 CSRF_REJECTED.
2. Cookies parsed, security headers added (helmet), global rate limit applied.
3. Route's own rate limit (login, reset password, ...), if it has one.
4. The ACCESS GUARD     kernel/http/guard.ts   (runs before the handler)
   a. The route must declare who may call it: public | staff | manager | platform.
      (A route with no declaration stops the app at start-up.)
   b. public  -> let it through.
      Otherwise -> the authenticator (from core.auth) reads the cookie, checks the access token, checks the session
      is still live in the database and the person is active. Not signed in -> 401.
   c. Email not verified yet? -> 403 EMAIL_NOT_VERIFIED (except the few routes that allow it).
   d. manager route and the person is not a manager -> 403.
      platform route and the person is not a platform admin -> 403.
   e. MODULE CHECK: the route belongs to a module. Ask the gate "is this module on for this person's business?"
      No -> 404, exactly as if the route did not exist.
5. Validation (zod): params and body must match the route's schema. Wrong -> 400. Extra, unknown fields are refused.
6. The handler -> the SERVICE -> the REPOSITORY -> the database, inside the business's fence.
7. The answer is checked against the route's response schema, so a field that should not leave (a hash, a token) can
   never be sent by accident.
```

Two things to notice:
- **Who you are and which business you belong to come from the session, never from the request.** A caller cannot say "I
  am business X".
- **Unknown, forbidden-by-fence, and switched-off all look like 404.** Another business's id gives 404, not "that exists
  but you cannot see it". That reveals nothing.

### The error codes you will see
| Code | Meaning |
| --- | --- |
| 400 | The request is malformed (wrong shape, missing field, extra field) |
| 401 | Not signed in, or the sign-in expired |
| 403 | Signed in, but not allowed (wrong role, email not verified, CSRF check failed) |
| 404 | Does not exist, belongs to another business, or its module is off |
| 409 | A rule stopped it (email already used, module not in the plan, needs another module first) |
| 429 | Too many requests |

---

## 5. The fence: how businesses are kept apart

Every table that holds a business's data has an `account_id` column, and Postgres **Row Level Security (RLS)** is turned on
and forced for it. A policy says: "you may only see rows where `account_id` equals the current business".

How it works at run time:
1. `runInAccountTransaction(businessId, work)` opens a transaction, tells Postgres "this transaction belongs to business X"
   and switches to a restricted database role, `app_user`.
2. Inside, every query is filtered by the database itself, even if the developer forgot a `WHERE account_id = ...`.
3. With no business set, the policy matches **nothing**, so a forgotten fence returns no rows rather than all rows.

Extra protections on top:
- The restricted role has **column-level grants** on sensitive tables. For example it can change `enabled` on
  `account_modules` but never `entitled`, and it can never set the platform-admin flag on `users`.
- Tables holding secrets (`user_credentials`, `sessions`, `auth_tokens`, `login_attempts`) are **closed** to the restricted
  role entirely.
- Work across businesses (sign-up, the platform route, the event dispatcher) uses the owner connection, in a few named
  places, and always names the business in its queries.

A schema test fails if any table with an `account_id` lacks RLS.

---

## 6. Module switches (F03) in this picture

A business has three switches per module:

| Switch | Meaning | Who changes it |
| --- | --- | --- |
| `entitled` | The plan includes it | The platform admin only |
| `enabled` | The business wants it on | The business's manager, only if entitled |
| ready | For channels: connected | Arrives with each channel (always true for now) |

Active = entitled and enabled (and ready). A module with no row is simply "not in the plan".

**How the gate answers.** The guard asks `gate.isActive(businessId, moduleId)`:
- core module -> always yes;
- otherwise -> look at the business's rows. The answer is **remembered for 10 seconds** so requests don't pay an extra
  database trip. Any switch clears it at once on the same server.

**How the gate gets into the kernel without the kernel importing a module.** The module-switches manifest sets
`moduleGate`. `app.ts` looks through the registry for a module that provides one, builds it, and stores it as
`app.kernel.gate`. The guard, the event dispatcher and the job runner all use that one gate. This is exactly how
`core.auth` provides the authenticator.

**Rules of switching:**
- Switching on needs: in the plan, and every module it `requires` is active (else 409).
- Switching off also switches off everything that needs it. Data is **kept**; switching on again restores it.
- Taking a module out of the plan (platform) switches it off, and what needs it.
- Every change writes the activity log and publishes an event (`module.enabled`, `module.disabled`, `module.entitled`...).

---

## 7. Sign-in and sessions (F01) in this picture

- Access token: a signed JWT, **15 minutes**, held in an httpOnly cookie (`toobler_access`, Path `/api`). Browser
  JavaScript can never read it.
- Refresh token: 256 random bits, **only its hash is stored**, replaced at every refresh. Using an old one again means
  it was stolen, so that session ends.
- Every request also checks the session in the database, so signing out or disabling a person works at once.
- Passwords: argon2id, at least 10 characters, not on a common list, not the email. Same answer and timing for an unknown
  email and a wrong password.
- Lockout: 5 wrong passwords in 15 minutes lock the email for 15 minutes.
- Emailed links (verify email 48 h, reset password 1 h): random, single use, only the hash is stored.
- A password reset or change ends the person's other sessions.

---

## 8. The rules of the codebase (what the tests and lint enforce)

| Rule | Enforced by |
| --- | --- |
| The kernel imports no module | lint `toobler/module-boundaries` |
| A module uses another only via its `index.ts` and only if listed in `requires` | the same lint rule |
| Every module has `routes/ services/ repositories/ helpers/`, correct file names, no empty folders | `module-structure.test.ts` |
| Routes never import repositories; only repositories touch the database | lint |
| Every route declares who may call it | the guard (start-up error) |
| Every public route is listed with a reason | `public-routes.ts` (start-up error) |
| Every table with `account_id` has RLS enabled and forced | `schema.test.ts` |
| Every route is tested for works / 401 / 403 / 404 / 400 | our test habit, checked at review |
| Names are full words; every function has a one-line comment | lint (readable names) and review |
| Only vetted, exact-version packages | `npm run vet` before install |
| Secrets only in `.env`, never printed, logged or committed | config checks, log redaction, review |
| One feature at a time, small slices, owner approves | `npm run gate` and our process |

Our habit after each change: format, typecheck, lint, run all tests, then **break each protection once on purpose** to prove
a test fails. A protection no test notices is not a protection.

---

## 9. Where to look when you want to understand something

| You want to know... | Open |
| --- | --- |
| How the server is built | `src/app.ts` |
| How a request is checked | `src/kernel/http/guard.ts`, `csrf.ts` |
| How a module is declared | any `modules/core/*/module.ts`, and `kernel/module-system/define.ts` |
| How modules are validated and ordered | `kernel/module-system/registry.ts` |
| How the fence works | `kernel/database/index.ts`, `db/migrations/001_kernel.sql` |
| What a feature does | `docs/features/<feature>.md` and the module's `README.md` |
| The big architecture | `docs/ARCHITECTURE.md`, `docs/SECURITY.md` |
