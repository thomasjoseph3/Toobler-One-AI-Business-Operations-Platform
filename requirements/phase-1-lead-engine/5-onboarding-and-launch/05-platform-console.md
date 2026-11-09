# Platform console

**Phase 1 · Launch · HubSpot equivalent: none (HubSpot's own internal admin)**

## What it is

Toobler's own screens for running the product: every business, their plan and health, support access, and alerts when
something breaks.

## How it works

- **Businesses:** list with plan, trial end, leads this week, last activity, channel health.
- **Business page:** details, engines on, support access (only when granted), suspend (with "Are you sure?").
- **Health:** WhatsApp, phone, email and AI connections checked hourly; failures alert the platform team.
- **Usage:** calls, minutes, messages and AI cost per business, to check our margins.

## Done when

- [ ] Every business and its health is visible to platform admins only.
- [ ] A broken connection alerts the team within an hour.

## For developers

- **Code folder:** `apps/api/src/core/platform`
- **API:** [API.md](../../API.md), Phase 1 → Platform console
- **Tables:** `usage_daily` (`account_id`, `day`, `call_minutes`, `messages`, `ai_tokens`, `cost_paise`), `alerts`,
  `support_grants`, `support_visits`.
