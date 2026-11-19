# API docs (Swagger / OpenAPI)

**Not a numbered feature.** A small tooling task agreed on 11 Nov 2026 (like COMMANDS.md): it adds no table, no screen and no
business rule, so it stays outside the F-number gate in `STATUS.md`. It still follows our process: brief, vetted
packages, small slices, your "go", your approval. Branch: `chore/api-docs`.

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
A web page (at `/docs` while the app runs in development) that lists every API route with its fields, examples and error codes, plus an OpenAPI file you can import into Postman. It is not a business feature; it is a tool for the team and for anyone integrating with Toobler One.

### Why it is useful
- **Always correct.** It is built from the same definitions the routes use, so it cannot drift from the code.
- **Faster testing.** Import the file into Postman instead of typing each request by hand. "Try it out" buttons work on the page.
- **Safe.** It exists only in development; production and tests do not serve it.

### How to use it
Start the API with `npm run dev` and open `http://localhost:4000/docs`. The OpenAPI file is at `http://localhost:4000/docs/json`. Routes are grouped by module (Auth, Industries, Module switches, Contacts, Leads, and so on).

### For the tech team
- **How:** every route declares its params, body and response with zod; `fastify-type-provider-zod`'s `jsonSchemaTransform` turns them into an OpenAPI document; `@fastify/swagger` collects it and `@fastify/swagger-ui` shows it. No route is described twice.
- **Dev only:** served only when `NODE_ENV=development`. "Try it out" is allowed through `API_DOCS_ORIGIN` (default `http://localhost:4000`), which is ignored outside development; production refuses to start when it is set. The `X-Requested-With: toobler-web` header is pre-filled on routes that change something.
- **Registration:** the docs plugin registers before the guard, so the guard's check that every route has an access declaration never sees the docs routes; a test proves they are absent outside development.
- **Packages (vetted):** `@fastify/swagger` 9.9.2, `@fastify/swagger-ui` 6.1.2, `@fastify/static` 10.1.8.
- The document describes routes and shapes only; no cookie, token or secret ever appears in it.

---

**Goal in one line:** a page that lists every API route with its fields and error codes, always in step with the code, and an
OpenAPI file you can import into Postman, so you stop typing requests by hand.

## How it works
Every route already declares its params, body and response with zod. `fastify-type-provider-zod` (already installed, v7)
ships `jsonSchemaTransform`, which turns those into an OpenAPI document. `@fastify/swagger` collects the document and
`@fastify/swagger-ui` shows it at `/docs`. No route is described twice, so the docs cannot drift from the code.

## Packages (vetted 11 Nov 2026 with `npm run vet`; exact versions, no install scripts)
| Package | Version | Age | Downloads / week | Licence |
| --- | --- | --- | --- | --- |
| `@fastify/swagger` | 9.9.2 | 33 days | 4.56 million | MIT |
| `@fastify/swagger-ui` | 6.1.2 | 33 days | 2.35 million | MIT |
| `@fastify/static` (pulled in by swagger-ui, same Fastify team) | 10.1.8 | 15 days | 8.55 million | MIT |

All three are maintained by the Fastify core team, have a repository, are not deprecated and run no install scripts. The
newer patch versions are under 14 days old, so we take the ones above. Nothing is installed until you say so.

## Decisions (owner, 11 Nov 2026)
- Dev only: the docs exist only when `NODE_ENV=development`. Nothing is served in production or tests.
- **"Try it out" is on.** `API_DOCS_ORIGIN` (default `http://localhost:4000`, name listed in `.env.example`) is allowed as an
  origin for changes, in development only. Outside development the setting is ignored, and **production refuses to start
  when it is set**. The web app's own origin and the `X-Requested-With` rule are unchanged.
- The header `X-Requested-With: toobler-web` is pre-filled on every route that changes something.
- The Supabase database is the **development** database; production gets its own later, with its own `.env`.
- Sharing with clients: the OpenAPI file (slice 2) and an optional standalone page (slice 3).

## Earlier options (superseded by the decisions above)
1. **Where it is served.** *Recommended:* only when the app runs in `development`. In production and in tests the address
   `/docs` does not exist (404). Production never lists its own routes to strangers.
2. **"Try it out" buttons.** *Recommended:* off. Our CSRF check requires `Origin: http://localhost:3000`, and a page served
   by the API would send a different Origin, so changes would be refused. We will not loosen the CSRF check for a docs
   page. Instead you import the OpenAPI file (`/docs/json`) into Postman and send requests there, as today but without
   typing each one.
3. **Grouping.** Routes are grouped by module (Auth, Industries, Module switches, Health), taken from the module id the
   kernel already puts on every route.

## Design notes
- The swagger-ui plugin registers several routes (`/docs`, `/docs/json`, static files) that have no `config.access`, and our
  guard stops the app when a route lacks it. The docs are registered **before** the guard, so the guard's start-up check
  never sees them. They are plain read-only pages, only exist in development, and a test proves they are absent otherwise.
  They are not added to `public-routes.ts` (that list is for real product routes).
- The document describes routes and shapes only. No cookie, token, password or secret value ever appears in it.
- Helmet's security headers stay on; the docs page gets its own content-security policy from the plugin.

## Slices (at most 2 routes each)
| Slice | What | State |
| --- | --- | --- |
| 1 | Install the two packages; serve `/docs` and `/docs/json` in development with "Try it out"; group by module; the CSRF allowance for development only; tests | **done** (owner 11 Nov 2026) |
| 2 | `npm run docs:api` writes `openapi.json` (full, and a client-safe one without internal routes) for Postman and for clients | skipped for now: `/docs/json` already is the OpenAPI document (Postman: Import → Link). Build it when a client needs a saved file. |
| 3 | Optional: a standalone documentation page for clients (tool to be vetted first) | dropped (owner, 11 Nov 2026) |
| 4 | One-line `summary` on every existing route (so the page reads in plain English, not just addresses) | not started |

## Tests
Present in development and 404 in production and test; lists every real route (a test compares the spec with the app's route
list, so a route can never be missing from the docs); every route has a tag; the document contains no secret-looking values;
shapes of one known route (`PATCH /modules/{id}`) are right.

## Manual test, slice 1
Check your `.env` has `NODE_ENV=development` and `API_DOCS_ORIGIN=http://localhost:4000`, then restart `npm run dev` once
(a new setting is read at start-up).
1. Open `http://localhost:4000/docs`. You see "Toobler One API", the routes grouped by module (core.auth, core.industries,
   core.module_switches, core.health), and the servers box showing `http://localhost:4000`.
2. Open `http://localhost:4000/docs/json`. It is the OpenAPI file (what Postman imports).
3. In `POST /api/v1/auth/login` click **Try it out**, enter your email and password, **Execute**. Expect 200. The header
   `x-requested-with` is already filled in.
4. Open `GET /api/v1/me` → Try it out → Execute. Expect 200 with `activeModules` (you are signed in through the cookie).
5. Open `PATCH /api/v1/modules/{id}` → Try it out, id `channel.webchat`, body `{"enabled": false}` → Execute. Expect 200. Then
   set it back to `true`.
6. Open `POST /api/v1/auth/logout` → Execute, then `GET /api/v1/me` again. Expect 401.
7. Production check (read only): in a copy of the settings with `NODE_ENV=production`, `API_DOCS_ORIGIN` set makes the app
   refuse to start. (Covered by a test; do not try it with your real `.env`.)
