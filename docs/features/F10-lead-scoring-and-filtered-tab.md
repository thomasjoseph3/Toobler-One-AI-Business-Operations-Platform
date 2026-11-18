# F10: Lead scoring and the Filtered tab

**Requirements:** `2-crm-core/07-lead-scoring-and-filtering.md`; `requirements/API.md` (Lead scoring and filtering); docs/plan/PHASE-1.md (F10); docs/CONVERSATION-TYPES.md.
**Depends on:** F06 leads, F15 conversation types, F19 AI agent.      **Module:** `core.leads` (scoring), `core.conversations` (the Filtered list).
**Status:** `approved` (18 Nov 2026, verify green; was `in_progress`) under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

**What it does.** Every lead is marked **hot**, **warm** or **cold**, with the reason in words ("Dates 12–15 Dec (within 30 days) and asked the price"), so your team knows who to call first. Calls and messages that are not real enquiries (spam, wrong numbers, silent calls) never clutter the board: they wait on a **Filtered** page, and one click brings back any that were real.

**Why it is useful.** Staff have limited time. The temperature tells them who is ready to buy; the Filtered page stops junk wasting their time without losing anything by mistake.

**A day in the life.** At 9 pm a visitor on the website chats: they say they want the hall on 14 December and ask the price. The assistant records that. By the time Meera opens the board next morning, the lead shows a red **Hot** tag with "Dates 14 Dec (within 30 days) and asked the price", so she calls it first. Later a stranger messages "Win a free prize": it is on the **Filtered** page, not the board. A genuine customer who wrote from a wrong number but really wanted a quote shows up there too; Meera presses **Move to leads** and it becomes a normal lead.

**Who can do what.** Everyone who can see a lead can read its temperature and set it by hand (staff on "own leads only" only for their own leads). Managers and staff can open the Filtered page and move items back; "own leads only" staff cannot see conversations yet.

**Settings and limits.** The rules are fixed (the business cannot change them in Phase 1). **Hot:** asked to book, or gave dates within 30 days and asked the price. **Warm:** gave dates, or asked the price. **Cold:** only general questions. A temperature you set by hand stays until that customer's next conversation, which scores the lead again. Dates the team typed on a lead are never replaced by dates the assistant heard.

**What it never does.** The AI never decides the temperature: it only records what the customer said, and fixed rules in code do the scoring, so the same facts always give the same answer. Filtered conversations are never deleted and never make a contact or a lead until a person moves them.

**Not part of it.** Writing your own scoring rules (later phase), scoring leads that came in without an AI conversation, and a "Filtered" count on the board.

### For the tech team

Scoring: `modules/core/leads/helpers/score.ts` (pure), applied by `leads/services/lead-scoring.service.ts` when the agents module handles `conversation.outcomes_applied`. Columns on `leads`: `temperature`, `temperature_reason`, `temperature_set_by` (`rules`/`manual`), `asked_price`, `asked_to_book` (migration 061); the AI's facts wait in `conversation_facts` (`asked_price`, `date_from`, `date_to`, migration 062). Routes: `PATCH /leads/{id}/temperature`, `GET /conversations?filtered=true`, `POST /conversations/{id}/unfilter` (a type correction to the business's lead type, preferring `new_enquiry`). Filtered = a real, sorted conversation whose current outcome is `filter`. Activity log: `leads.temperature_changed`, `leads.scored`. Known limits: the Filtered list has no filters or search; a conversation that made no lead scores nothing; "asked to book" comes from the AI marking the customer ready to book.

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

**Slice 2 (built):** no new routes. The AI's `save_details` now also takes `askedPrice` and real dates `dateFrom` / `dateTo` (YYYY-MM-DD, a made-up day or a range the wrong way round is refused and the model asks again); prompt version is `agent-2`. They wait in the conversation's facts (migration `062_conversation_facts_lead_facts.sql`). When the conversation's lead is made or joined (`conversation.outcomes_applied`), the lead gets them (`asked_price` and `asked_to_book` are only switched on, never off; dates are filled in only when the lead has none, so staff's dates win) and is scored by `score.ts`; a new conversation replaces a temperature set by hand. Activity log kind `leads.scored` (field name only, written only when the score changes). A conversation that made no lead scores nothing. This also closes part of the R74 gap (the AI's dates now reach the lead). Tests: `agent-lead-score.test.ts` (5), the state tests in `agent-conversation-state.test.ts`.

**Slice 3 (built):** `GET /conversations?filtered=true` (managers and staff; the "own leads only" role is 403; `filtered=true` is required, anything else is 400; newest first, 25 to a page, `page` and `limit`) and `POST /conversations/{id}/unfilter` (puts a filtered conversation back: it is a type correction to the business's lead type, preferring `new_enquiry`, so the contact and lead are made the usual way and the correction is counted; 409 `NOT_FILTERED` when it is not in the list, 409 `NO_ENQUIRY_TYPE` when every lead type is switched off; unknown or another business's id is 404). No migration. Web: a **Filtered** link in the Leads toolbar and the page `/leads/filtered` (type tag, sender, channel and time, the customer's first words, **Move to leads**, loading, error with retry, empty, paging). Tests: six in `conversations-routes.test.ts`, isolation entries (list and unfilter), `e2e/filtered.spec.ts` (phone and desktop, including accessibility).
