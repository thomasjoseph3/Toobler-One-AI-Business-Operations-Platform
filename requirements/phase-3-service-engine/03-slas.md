# Response-time targets (SLAs)

**Phase 3 · Service · HubSpot equivalent: SLA management, Conditional SLAs**

## What it is

Targets for how fast tickets are answered and closed ("first reply within 1 hour, closed within 24 hours"), different
by priority or customer type, counted only in office hours if the business chooses. Tickets about to miss a target are
flagged and escalated.

## How it works

1. Manager sets targets per priority.
2. Each ticket shows time left. At 80% used, the owner is alerted; when missed, the manager is.
3. Reports show the percentage met.

## Done when

- [ ] Time left, alerts and missed targets are correct, including office-hours counting.

## For developers

- **Code folder:** `apps/api/src/engines/service/slas`
- **API:** [API.md](../API.md), Phase 3 → Response-time targets (SLAs)
- **Tables:** `sla_policies`, ticket columns `first_reply_due`, `close_due`, `first_replied_at`.
