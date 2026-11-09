# Engines and plans

**Phase 1 · Foundation · HubSpot equivalent: Hubs and editions (Free, Starter, Professional, Enterprise)**

## What it is

A record of which engines each business has switched on. In Phase 1 every business has the CRM core and the lead
engine. Later engines (sales, service, marketing and so on) are switched on per business, and the app shows only their
pages and gives the AI only their tools.

## Why it matters

This is how we sell more later without rebuilding. A business pays for what it uses, and the screens stay simple for
those that use only a little.

## How it works

1. When a business signs up, it gets the CRM core and the lead engine.
2. From Phase 2, a manager opens **Settings → Engines** and switches one on (after paying, see
   [subscription billing](../5-onboarding-and-launch/04-subscription-billing.md)).
3. The menu shows the new pages straight away, and the AI gets the new tools on its next conversation.
4. Switching an engine off hides its pages and tools but keeps its data, so switching back on loses nothing.

## Rules

- Only one engine exists in Phase 1, so the Settings switch screen is built in Phase 2. Phase 1 builds only the record
  and the check.
- Every page and every agent tool belonging to an engine checks that the engine is on.

## Done when

- [ ] Each business has a record of its engines.
- [ ] A page or tool from an engine the business doesn't have is refused, with a test proving it.

## Better than HubSpot

- One price per engine, no separate Starter/Professional/Enterprise tiers inside each engine (decision open; see
  billing).

## For developers

- **Code folder:** `apps/api/src/core/engines`
- **API:** [API.md](../../API.md), Phase 1 → Engines and plans
- **Table:** `account_engines` (`account_id`, `engine` in `leads`, later `sales`, `service`, `marketing`, `automation`,
  `content`, `ai_plus`; `enabled_at`, `disabled_at`).
