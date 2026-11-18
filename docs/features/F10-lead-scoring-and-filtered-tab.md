# F10: Lead scoring and the Filtered tab

**Requirements:** `2-crm-core/07-lead-scoring-and-filtering.md`; `requirements/API.md` (Lead scoring and filtering); docs/plan/PHASE-1.md (F10); docs/CONVERSATION-TYPES.md.
**Depends on:** F06 leads, F15 conversation types, F19 AI agent.      **Module:** `core.leads` (scoring), `core.conversations` (the Filtered list).
**Status:** `in_progress` under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

*(Written in full at the end of the last slice. Plan below.)*

## Reused from the hotel agent

Nothing that fits: the old project had no lead temperature. Designed from the requirement.

## Decisions (recorded in docs/REQUIREMENTS-REVIEW.md as R76)

- **Scoring is code, from facts:** `helpers/score.ts` (pure, a test per rule). Hot: asked to book; or dates within 30 days and asked the price. Warm: dates, or asked the price. Cold: only general questions. The reason is one short sentence ("Dates 12–15 Dec (within 30 days) and asked the price").
- **A person's setting wins until the next conversation:** `temperature_set_by` is `rules` or `manual`; the next scoring (after a conversation) replaces a manual setting.
- **The Filtered tab lists conversations, not leads** (owner decision, 18 Nov 2026): spam, wrong numbers and silent calls never become leads or contacts. So the routes are `GET /conversations?filtered=true` and `POST /conversations/{id}/unfilter`, not the `/leads` names in API.md; API.md is updated.
- **Hot / warm / cold look:** icon + word + colour family (Hot = error + flame, Warm = warning + sun, Cold = information + snowflake), as proposed in FRONTEND.md.

## Slice plan (at most 2 routes each)

1. `PATCH /leads/{id}/temperature`; the pure score rules; migration 061 (reason, who set it, the two facts); the tag and the set-by-hand control on the lead page and list.
2. The AI records the facts (asked the price, asked to book); when its conversation makes or joins a lead, the lead is scored (no new routes).
3. `GET /conversations?filtered=true`, `POST /conversations/{id}/unfilter`; the Filtered tab.

## Slice log

**Slice 1 (built):** `PATCH /leads/{id}/temperature` (any signed-in role; the "own leads only" role only for its own leads; body `{temperature: hot|warm|cold}`, anything else is 400; setting the same by-hand value again changes nothing). Every lead read now shows `temperatureReason` and `temperatureSetBy`. Migration `061_leads_temperature_facts.sql` (`temperature_reason`, `temperature_set_by`, `asked_price`, `asked_to_book`). `helpers/score.ts` with its tests. Activity log kind `leads.temperature_changed` (field name only). Web: the tag (icon + word, reason on hover) in the lead list rows and cards and on the lead page, and "Set temperature" on the lead page. Tests: `score.test.ts`, `lead-temperature.test.ts`, isolation entry, `temperature.test.ts`, `e2e/lead-page.spec.ts`.
