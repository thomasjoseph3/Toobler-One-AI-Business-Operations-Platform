# Architecture

*Engineering architecture for the whole product. The product view is in [requirements/ARCHITECTURE.md](../requirements/ARCHITECTURE.md);
this page says how the code is built so that every engine, channel and feature plugs in and out without touching the
others.*

Companion docs: [BACKEND.md](BACKEND.md) (how to write backend code), [FRONTEND.md](FRONTEND.md) (design guide),
[SECURITY.md](SECURITY.md), [CONVERSATION-TYPES.md](CONVERSATION-TYPES.md), [DEVELOPMENT.md](DEVELOPMENT.md) (how we
work, one feature at a time).

## 1. Shape: a modular monolith with plug-in modules

One repository, one API process (plus workers), one database. Inside the API, everything is a **module** with a
manifest. Modules are compiled in: "plug and play" means **each business switches modules on and off at run time**,
and a module's code never reaches into another module's code.

```text
┌────────────────────────────────────────────── apps/api ──────────────────────────────────────────────┐
│                                                                                                       │
│   kernel/   module registry · event bus (outbox) · job runner · conversation engine · agent runtime    │
│   ─────────────────────────────────────────────────────────────────────────────────────────────────── │
│   core modules (always on)      engines (paid bundles)        channels (connectors)    features      │
│   accounts auth users audit     leads   (Phase 1)             webchat   (Phase 1)       followups    │
│   contacts companies activities sales   (Phase 2)             whatsapp  (Phase 1)       assistant    │
│   tasks fields views imports    service (Phase 3)             email     (Phase 1)       competitors  │
│   duplicates conversations      marketing … (Phase 4–7)       phone     (Phase 1)       duplicates…  │
│   tickets notifications                                       sms       (Phase 4)                    │
│   knowledge reports platform                                                                          │
│                                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲ HTTP + cookie                ▲ HTTP / SSE               ▲ webhooks / WebSocket
     apps/web (staff app)       apps/site (widget, public)   Meta · Exotel/Twilio · Gmail · Razorpay
```

### Module kinds

| Kind | Example | Can a business switch it off? | Who decides |
| --- | --- | --- | --- |
| `core` | contacts, tasks, inbox | No. Every business has it. | — |
| `engine` | `leads`, later `sales`, `service`, `marketing` | Yes | Platform **entitles** it (the plan); the manager **enables** it |
| `channel` | `webchat`, `whatsapp`, `email`, `phone` | Yes | Entitled by plan, enabled by the manager, then **connected** (keys, number, mailbox) |
| `feature` | `followups`, `assistant`, `competitors` | Yes | Entitled by plan, enabled by the manager |

Three switches per module per business: **entitled** (the plan allows it) → **enabled** (the business wants it) →
**ready** (for channels: connected and healthy). Only a module that is all three is active. Stored in
`account_modules` (`account_id`, `module_id`, `entitled`, `enabled`, `enabled_at`, `disabled_at`, `settings` jsonb).
This replaces and extends the requirement's `account_engines` table.

Switching a module off **hides** it (routes return 404, its tools disappear from the agent, its menu items go) and
**keeps its data**, so switching it back on loses nothing.

### The module manifest

Every module exports one manifest. The kernel reads manifests; nothing else is registered by hand.

```ts
// apps/api/src/modules/channels/whatsapp/module.ts
export default defineModule({
  id: 'channel.whatsapp',
  kind: 'channel',
  requires: ['core.conversations'],          // must be active for this one to be active
  routes: [whatsappRoutes],                   // mounted under /api/v1, guarded by "is this module active?"
  webhooks: [whatsappWebhook],                // provider routes: signature-checked, no session
  channel: whatsappAdapter,                   // the ChannelAdapter (below)
  agentTools: [sendDetailsWhatsapp],          // offered to the agent only while active
  events: { 'task.due_soon': sendReminder },  // subscriptions on the event bus
  jobs: [templateStatusSync],                 // scheduled work
  conversationTypes: [],                      // types it adds to presets (none here)
  outcomes: [],                               // outcome kinds it handles (none here)
  settings: whatsappSettingsSchema,           // zod; per-business settings in account_modules.settings
  health: checkWhatsappConnection,            // for channel status and the platform console
  nav: [],                                    // menu items (the web app reads these from /me)
});
```

| Manifest part | What the kernel does with it |
| --- | --- |
| `routes` | Mounts them; every request first checks the module is active for the signed-in business (else 404) |
| `webhooks` | Mounts them without a session; the adapter checks the provider's signature |
| `channel` | Registers the adapter with the conversation engine |
| `agentTools`, `assistantTools` | Offered to the agent / assistant / MCP server only for businesses with the module active |
| `events` | Subscribes handlers on the event bus; skipped for businesses without the module active |
| `jobs` | Registers scheduled and on-demand jobs in the job runner |
| `conversationTypes`, `outcomes`, `playbooks` | Extends conversation types (see [CONVERSATION-TYPES.md](CONVERSATION-TYPES.md)) |
| `slots` | UI extension points the module fills (lead page sidebar, contact page, settings section) |
| `presets` | Per-industry defaults it adds at sign-up (stages, fields, types) |
| `health` | Hourly health checks; status on the channel page and the platform console |

### Dependency rules (checked by ESLint, the build fails otherwise)

1. **Core never imports an engine, channel or feature.** It asks the registry.
2. **Modules never import each other's internals.** A module may import another module's **public API**
   (`modules/<x>/index.ts`), and only if that module is in its `requires` list.
3. **Cross-module reactions go through events**, not direct calls: "a lead was won" is published once; whoever
   cares subscribes.
4. Inside a module: `routes → service → repository → db` (see [BACKEND.md](BACKEND.md)). Only repositories run SQL.

So the dependency arrows always point **inwards**: channels → conversations ← engines → core. A new engine adds
files; it changes no existing file except one line in the module list.

## 2. The conversation engine (the "engine" concept)

Every channel, now and later, feeds one pipeline. This is what makes channels plug and play: a channel adapter only
translates between the provider and our normalised messages.

```text
 provider ──► ChannelAdapter.parseInbound() ──► NormalisedInbound { accountId, channel, from, text|audio, providerIds }
                                                   │
                                   ┌───────────────▼────────────────┐
                                   │ ConversationEngine.receive()   │
                                   │  1 identify: contact by phone_key/email (create later, by the router)
                                   │  2 open or continue the conversation (per channel window rules)
                                   │  3 pre-filter rules (conversation types step 0)
                                   │  4 held by staff? → notify the holder, stop (staff takeover)
                                   │  5 agent turn → reply text + tool calls
                                   │  6 adapter.send(reply)  (respecting the channel's capabilities)
                                   │  7 publish conversation.message events (inbox live update)
                                   └───────────────┬────────────────┘
                                                   │ on end (hang-up / idle / email done)
                                   ┌───────────────▼────────────────┐
                                   │ finalise: summary, final type, router → outcomes,
                                   │ scoring (code), tasks from promises, alerts, events
                                   └────────────────────────────────┘
```

```ts
interface ChannelAdapter {
  id: 'webchat' | 'whatsapp' | 'email' | 'phone' | string;      // later: 'sms', 'instagram', …
  capabilities: { text: boolean; media: boolean; voice: boolean; templates: boolean; replyWindowHours?: number };
  resolveAccount(input: RawInbound): Promise<AccountId | null>;   // number / WABA id / mailbox / widget key → business
  parseInbound(input: RawInbound): Promise<NormalisedInbound[]>;
  send(conv: ConversationRef, msg: OutboundMessage): Promise<DeliveryResult>;
  connect?(accountId, input): Promise<void>;  disconnect?(accountId): Promise<void>;
  health(accountId): Promise<Health>;
}
```

Voice is the one channel with a live stream: the phone adapter bridges audio to the voice runtime (Gemini Live)
instead of text turns, and hands the same finalise step the transcript at hang-up.

**Unified conversations.** All channels write to one `conversations` table plus `messages`, with a small detail
table where a channel needs one (`calls`: duration, recording key; `emails`: message ids, headers). The requirements
listed separate `chats`, `calls` and `emails` tables; one table makes the inbox, takeover, classification and reports
channel-agnostic (see [REQUIREMENTS-REVIEW.md](REQUIREMENTS-REVIEW.md)).

## 3. The agent runtime

```text
agents/
  runtime/     prompt builder (business profile + types + playbook + industry words), model calls, the tool loop,
               summaries, final classification
  tools/       every tool defined once: zod input schema, effect (reads | writes | sends | ticket), module owner
  languages/   voice only: detection, language lock, number words (Malayalam, Hindi, English). Text agents are English only.
  voice/       live phone sessions (Gemini Live)
  text/        webchat and WhatsApp turns
  email/       email sorting and replies
  assistant/   the staff assistant (same tools as MCP)
  setup/       the setup chat
```

- **The model is behind an interface** (`LlmProvider`: `generate`, `generateObject`, `stream`), so Gemini or Claude
  is a setting per task, chosen by evals. Tests use a scripted fake provider, so unit and API tests never call a model.
- **Tool identity comes from the server, never the model.** The runtime calls a tool with a `ToolContext`
  (`accountId`, `conversationId`, `contactId`, `channel`) that it built itself; the model only supplies the
  arguments, which are validated like a form.
- **Facts, not decisions.** Tools record facts (dates, party size, asked the price, asked to book, the promise). The
  lead's temperature, the outcome and the task's due time are computed by code from those facts.
- **Tool sets are per business**: the active modules' tools, filtered again by playbook (a `service` conversation
  doesn't get sales tools).

Phase 1 tools (from the requirements, with the conversation-types change):

| Tool | Module | Effect |
| --- | --- | --- |
| `get_business_info`, `list_offerings`, `search_knowledge` | core.knowledge | reads |
| `log_unanswered_question` | core.knowledge | writes |
| `set_conversation_type` | core.conversations | writes (live type, playbook switch, urgent alerts) |
| `save_details` (requirement name `save_lead`) | core.conversations | writes facts to the conversation; the router makes the contact, lead or ticket |
| `request_human_callback` | core.tickets | ticket |
| `send_details_whatsapp` | channel.whatsapp | sends |
| `transfer_call`, `end_call` | channel.phone | call control |

## 4. Events: how modules react to each other

A **transactional outbox**: a service writes its change and the event in the same database transaction
(`domain_events` table), and the event dispatcher (`kernel/events/`, a polling loop with leases, separate from the
pg-boss job runner) delivers each event to its subscribers at least once. Handlers are idempotent (keyed by event id).
Details and the retry rules are in [BACKEND.md](BACKEND.md) §4.

Phase 1 events (names are the contract, payloads are ids, not personal data):

| Event | Published by | Typical subscribers |
| --- | --- | --- |
| `contact.created`, `contact.updated`, `contact.merged`, `contact.erased` | contacts, duplicates, privacy | search, duplicates |
| `lead.created`, `lead.stage_changed`, `lead.assigned`, `lead.temperature_changed`, `lead.won`, `lead.lost` | leads | notifications, follow-ups, today (SSE), reports, **Phase 2 sales** |
| `conversation.started`, `conversation.message`, `conversation.typed`, `conversation.ended`, `conversation.held`, `conversation.released` | conversations | inbox (SSE), router, notifications |
| `ticket.created`, `ticket.closed` | tickets | notifications, **Phase 3 service** |
| `task.created`, `task.due_soon`, `task.overdue`, `task.done` | tasks | notifications, today (SSE) |
| `module.enabled`, `module.disabled` | kernel | presets, menus |

Live screen updates (`GET /events`, server-sent events) are a subscriber too: it forwards the signed-in business's
events (ids and kinds only) to its open screens, which then refetch what they show.

## 5. Outcomes

The router produces outcomes; each outcome kind is handled by the module that owns it:

| Outcome | Handler module | If that module is off |
| --- | --- | --- |
| `lead` | `engine.leads` | `log` + a callback task |
| `ticket` | `core.tickets` (Phase 3: `engine.service` takes over) | — (core) |
| `log`, `filter`, `ignore`, `review` | `core.conversations` | — (core) |
| Phase 2: `booking_change` | `engine.sales` | `ticket` |

## 6. How later phases attach (example: the sales engine)

What `engine.sales` (Phase 2) adds, **without editing the lead engine**:

| Need | How it plugs in |
| --- | --- |
| Products, quotes, payments on a lead | Its own tables (`lead_products`, `quotes`, …) keyed by `lead_id`; its own routes |
| Show them on the lead page | Fills the UI slots `lead.sidebar` and `lead.card.badges` |
| AI can quote and send payment links | `agentTools: [price_quote, send_payment_link, …]`, offered only when active |
| Paid → lead Won | Calls the leads module's **public** `moveLead()`; the leads module publishes `lead.won` as always |
| Customers changing bookings | Adds outcome `booking_change` and a preset type; the router hands those conversations to it |
| Switch it on | Platform entitles, manager enables in **Settings → Modules**, menus and tools appear |

The same recipe works for service (tickets pipeline, portal), marketing (consent, campaigns subscribe to
`contact.created`), automation (workflows subscribe to every event) and the rest.

## 7. Data

- **PostgreSQL 17** (Supabase), all our tables in our own schema `app` (not `public`, which Supabase exposes through
  its Data API).
- **Row Level Security on every business table**: `account_id` + policy `account_id = app.current_account_id()`. The
  API runs business work inside `forAccount(accountId, fn)`, on connections that `SET ROLE app_user` and set the
  account. A query that forgets its `WHERE account_id` still sees only that business. (Same design as the hotel
  agent's `remi_app` fence.)
- **Global tables** (no `account_id`, no RLS, reached only from named repository functions): `users`, `sessions`,
  `auth_codes`, `accounts` (RLS by `id`), `platform_*`, `domain_events` delivery state, and the cross-business
  lookups for webhooks (`phone_numbers`, `connections` lookup by provider id).
- **Migrations**: `db/migrations/NNN_<module>_<what>.sql`, numbered, forward-only, one per change, each enabling RLS
  on the tables it creates.
- **Extensions**: `pgcrypto` (UUIDs), `pg_trgm` (search), `citext` (emails), `unaccent`, `vector` (knowledge search).
- **Jobs**: `pg-boss` (a job queue stored in Postgres), so there is no Redis to run in Phase 1.
- **Files**: S3-compatible storage (Supabase Storage), private buckets, short-lived signed links.

## 8. Apps and folders

```text
<repo>/
├── apps/
│   ├── api/                      Fastify 5 + TypeScript
│   │   └── src/
│   │       ├── kernel/           registry, module guard, event bus, jobs, config, db, errors, http plumbing
│   │       ├── modules/
│   │       │   ├── core/<name>/  routes.ts · service.ts · repository.ts · schemas.ts · module.ts · index.ts · *.test.ts
│   │       │   ├── engines/<name>/
│   │       │   ├── channels/<name>/   + adapter.ts
│   │       │   └── features/<name>/
│   │       ├── agents/           runtime · tools · languages · voice · text · email · assistant · setup
│   │       ├── providers/        outside services behind interfaces: llm, messaging, mail, storage, telephony, payments
│   │       └── industries/       presets and wording per industry (data, no code paths)
│   ├── web/                      React + Vite staff app (single-page app; calls the API with the session cookie)
│   │   └── src/{app,features/<module>,components,lib}
│   ├── site/                     React + Vite public site: chat widget, free check (later: quotes, portal)
│   └── mcp/                      MCP server: the assistant's tools for Claude and other AI apps
├── packages/
│   ├── shared/                   zod schemas and types shared by API and apps (the API contract)
│   └── ui/                       design tokens and shared components (see FRONTEND.md)
├── db/migrations/                001_… onwards
├── evals/                        agent and classification evals (scripted conversations, labelled sets)
├── docs/                         these engineering docs, the plan, feature briefs
├── requirements/                 the product requirements (owner's documents)
└── .github/workflows/            ci.yml, deploy-staging.yml, deploy-production.yml
```

## 9. Technology

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere, Node 22+ (24 LTS recommended) | Requirements; one language; AI SDK needs Node 22+ |
| API | Fastify 5, `fastify-type-provider-zod`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cookie`, pino | Requirements; schemas validate requests and type the handlers |
| DB access | `pg` + Kysely (typed SQL builder, not an ORM), raw `.sql` migrations | Typed queries, SQL stays visible, repository pattern stays simple |
| Validation | zod 4, shared in `packages/shared` | One schema for API, forms and agent tools |
| Jobs | pg-boss | Postgres only, survives restarts, cron + retries |
| AI | Vercel AI SDK (provider-agnostic: Gemini, Claude), `@google/genai` for Gemini Live voice | Swap models by evals, structured output, tool calling |
| Staff app, site | React 19 + Vite, react-router, Tailwind 4, lucide icons, dnd-kit (board) | Owner's choice: React only, no Next.js. Single-page apps suit logged-in dashboards. |
| Live updates | Server-sent events | Requirements |
| Tests | Vitest (unit + API against a throwaway Postgres in Docker), Playwright (click-through), evals | Requirements |
| Errors | Sentry (or similar), pino logs with redaction | Requirements |
