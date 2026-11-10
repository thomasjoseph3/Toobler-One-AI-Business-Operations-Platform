# Project rules: Toobler One

**Toobler One — AI Business Operations Platform.** Package scope `@toobler-one/*`.

An AI-first CRM for small businesses (HubSpot's features, with AI agents that answer every call, WhatsApp, chat and
email). Built as a product: core + plug-in engines, channels and features. We are building **Phase 1: the lead
engine and the CRM core**.

## Read first

| Doc | For |
| --- | --- |
| `requirements/` | The owner's product requirements. The source of truth for *what*. Never edit them without being asked. |
| `docs/ARCHITECTURE.md` | Modules (plug and play), the conversation engine, events, how later engines attach |
| `docs/BACKEND.md` | Repository pattern, conventions, tests |
| `docs/design/TooblerOne_Design_System_v1.0.md` | The designer's design system (authority; do not edit) |
| `docs/FRONTEND.md` | How we apply it in code, proposed extensions, contrast findings, front-end rules |
| `docs/SECURITY.md` | Controls and the per-feature security checklist |
| `docs/CONVERSATION-TYPES.md` | How conversations are classified and routed (not every call is a lead) |
| `docs/DEVELOPMENT.md` | The one-feature-at-a-time process |
| `docs/plan/PHASE-1.md`, `docs/plan/STATUS.md` | The feature plan and its status |
| `docs/REQUIREMENTS-REVIEW.md` | Gaps and decisions; record new ones here |

## The gate: one feature at a time (non-negotiable)

1. Work only on the feature that is `in_progress` in `docs/plan/STATUS.md`. **Never start the next feature until the
   owner says it is approved.** Not even "prep work" for it.
2. Every feature goes: brief → migration → backend → front end → tests → `npm run verify` → manual check in the
   running app (phone and desktop) → hand-off with a manual test script → **stop and wait**.
3. When the owner approves: set `approved` with the date in STATUS.md, then commit (only then).
4. If something in the requirements is missing, conflicting or could be better: **ask before building it differently**,
   then record the decision in the brief and in REQUIREMENTS-REVIEW.md.
5. Use the `feature` skill for every step of this process.

## Dependencies rule

Only stable, well-known packages, vetted first with `npm run vet -- <name>` (≥14 days old, ≥50k downloads a week, named
maintainers, repository, not deprecated) and installed with exact versions and no install scripts. Node is the LTS in
`.nvmrc`. Never install a package the user hasn't seen vetted, never from a git URL or tarball, and record exceptions in
`docs/DEPENDENCIES.md`. Full policy there.

## Language rule

The whole app and every **text** channel (web chat, WhatsApp, email, setup chat, staff assistant) is **English only**. Malayalam and Hindi are supported for **voice calls only**. Text typed by customers in other scripts is stored and shown as typed.

## Architecture rules

- **Modules.** Everything lives in a module with a manifest (`module.ts`). Core never imports engines, channels or
  features. A module uses another only through its `index.ts`, and only if it lists it in `requires`. Cross-module
  reactions go through events (outbox), never direct "tell" calls.
- **Plug and play.** Every engine/channel/feature route, tool, job, event handler and menu item checks the module is
  active for the business (entitled + enabled + ready). Off = 404 and hidden; data is kept.
- **Channels** only translate provider ⇄ normalised messages (`ChannelAdapter`). All conversation logic is in the
  conversation engine, the same for every channel.
- **Repository pattern.** `routes.ts → service.ts → repository.ts → kernel/db`. Only repositories touch the database.
  Routes never import repositories. Pure logic (scoring, router, maths) in its own file without I/O.
- **The AI states facts; code decides.** Lead temperature, conversation outcomes, prices, totals, due times and report
  numbers are computed in code. The AI never does maths.
- **Industries change words and presets, never code paths.**
- **Build only what this phase and this feature need.** No tables or screens for later phases.

## Readability rules (the owner is learning TypeScript and must be able to read every line)

- **Names show the true purpose.** Every function, variable, parameter, type and file is named for exactly what it does
  or holds, in full words. Never shorten to save space: `transaction` not `tx`/`trx`, `error` not `e`/`err`,
  `module` not `m`, `accountId` not `acc`, `getContactsForAccount` not `getContacts2`. The only accepted
  abbreviations are ones everyone knows (`id`, `url`, `uuid`, `http`, `api`, `db` in a type name like `Db`).
- A longer, clear name always beats a short, clever one. No single-letter names, except a loop counter or a tiny
  inline arrow such as `(contact) => contact.id` (and even there, name it for what it is).
- Every function gets a one-line comment saying what it is for and what it returns, in plain English; non-obvious
  lines say *why*, not just what.
- When touching existing code, rename unclear names in the lines you change. Do not rewrite untouched files unless the
  owner asks.
- Prefer simple, explicit code over compact tricks (no clever one-liners, nested ternaries or dense chains).

## Data and security rules

- Every business table: `account_id`, RLS enabled and forced. Business work runs inside the account fence
  (`accountContext.runInAccountTransaction`). The account comes from the session / widget key / provider lookup / job, never from input.
- Another business's id → 404. Wrong role → 403. Every route tested for works / 401 / 403 / 404 / 400.
- Money in paise (integers). Times in UTC (`timestamptz`), shown in the business's time zone. Phones as E.164 +
  `phone_key`. IDs are UUIDs.
- Every change records its actor (user, agent, assistant, import, system).
- Secrets only in env (validated at start-up) or encrypted in `connections`. Never log secrets or personal data.
- Migrations: `db/migrations/NNN_<module>_<what>.sql`, numbered, forward-only, one per change.
- **Never run tests, seeds or experiments against `DATABASE_URL`** (Supabase). Tests use `TEST_DATABASE_URL` (local
  Docker). Never print or commit `.env` values.
- Every delete in the UI asks "Are you sure?" naming the thing.

## Front-end rules

- **The designer's `docs/design/TooblerOne_Design_System_v1.0.md` is the authority** for colour, type, spacing, radius,
  components and motion. Never edit it; gaps go in `docs/FRONTEND.md` §4–5 as proposals for the designer. Manrope +
  Inter (plus Noto Sans Malayalam/Devanagari fallbacks) self-hosted by the Vite build (no call to Google Fonts). Use the designer's colours unchanged (owner decision: keep as delivered; known contrast exceptions are listed in FRONTEND.md §5).
- Phone first (375 px), then desktop. Tokens and components from `packages/ui` only; no one-off colours.
- Temperature, channel and AI/person always shown with icon + word, never colour alone.
- No hard-coded industry words; use the business's labels. All UI text through `t()`.
- Every list: empty, loading and error states.

## Commands

`npm run setup` · `npm run dev` · `npm test` · `npm run e2e` · `npm run verify` (must be green before hand-off) ·
`npm run gate` · `npm run db:migrate` · `npm run eval:agent` · `npm run eval:types`

## Reference implementation

`../hotel agent` is the owner's previous version, and the owner wants its working tech reused. Stack is TypeScript
(decided). Keep the repository pattern, layering lint rules, `forAccount` RLS fence, error shapes, httpOnly cookie sessions, design tokens and `api-security` rules.

**Reuse check, per feature (just in time):** before building a feature, read the old implementation of that area (the
"Port from" table in `docs/plan/PHASE-1.md` lists the paths). Don't read ahead for later features. Write what you
reuse, what you change and why in the brief under "Reused from the hotel agent". Port the working tech and ideas to
TypeScript and our module/channel design; don't copy industry-specific code paths. If the old approach beats a choice
in docs/ARCHITECTURE.md (AI SDK vs LangChain, pg-boss vs the old sweeper, Kysely vs raw `pg`), say so and ask the
owner before switching.
