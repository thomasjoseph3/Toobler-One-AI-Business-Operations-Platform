---
name: lead-engine-rebuild
description: "Project context - Toobler One (AI Business Operations Platform), rebuilding the hotel agent as a HubSpot-like AI CRM with plug-and-play engines/channels; Phase 1 = lead engine"
metadata:
  node_type: memory
  type: project
  originSessionId: e891b4fa-b58b-424f-9e49-1b74e507f20b
  modified: 2026-11-09T09:43:40.893Z
---

Product name (decided 9 Nov 2026): **Toobler One — AI Business Operations Platform**, package scope `@toobler-one/*`.
Rebuild of `../hotel agent` (owner's earlier version, JS/Express; its repository pattern, layering and RLS fence are the
standard; stack for the rebuild is TypeScript) as a product: CRM core + plug-in engines, channels (webchat, WhatsApp,
email, phone) and features that each business's admin switches on/off. Requirements in `requirements/` (owner: Thomas
Joseph, written 6 Nov 2026). Only Phase 1 (lead engine + CRM core) is in scope; later engines (sales, service, ...) must
attach without changing the lead engine.

Owner reuses old tech for mailbox reading, voice calls, WhatsApp and web chat: read the old code per feature, just in
time (table in docs/plan/PHASE-1.md), not up front.

Designer's design system: `docs/design/TooblerOne-Design-System-v1.3.md` (neutral charcoal, Plus Jakarta Sans + Inter; v1.3 replaced v1.0 on 13 Nov 2026) is the authority
for the front end; never edit it, send gaps/contrast findings to the designer (docs/FRONTEND.md §4-5).

Owner asked that not every call/message becomes a lead: per-business conversation categorisation with different
outcomes and customer-service alerts -> docs/CONVERSATION-TYPES.md.

`.env` holds DATABASE_URL to a Supabase Postgres 17 (pgvector available). Never read/print its value (the auto-mode
classifier blocks cat of .env); tests must use a local Docker DB. Open decisions: docs/REQUIREMENTS-REVIEW.md.
Related: [[feature-gate-workflow]].

Progress (11 Nov 2026): F00, F01, F03 and F04 (Contacts) are approved and merged into `dev` (F04 merge c3bb979). Backend
done for each; all screens are on hold until the designer's screens arrive. Next feature is F06 (Pipeline and leads board):
the owner paused until the next day; it starts only on their "continue" (reuse check + brief + slice plan, then wait for "go").
`main` is untouched (production, only checked merges from dev).
Owner runs web on :3000 and API on :4000 in their own terminals to watch logs: never start servers on those ports; use 4100
for live API checks, e2e uses :3100. The owner's `.env` does not parse in a shell: load it with Node `process.loadEnvFile`.

Progress (13 Nov 2026): F00, F01, F03, F04, F06, F14, F16, F17, F18 and F37 are approved (backend; F37 approved 13 Nov). The UI
(screens) was rebuilt on branch `feature/ui-design-v1.3` in slices 1 to 9: see [[ui-rebuild-v1-3]]. Next planned feature is
F15 (conversation types and the router), backend only ("continue without UI"); it needs three owner decisions first (how to feed
and test the router, store messages now or not, which AI key and model).
