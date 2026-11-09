# Staff calling and call logging

**Phase 2 · Sales tools · HubSpot equivalent: Calling, Power dialer, Call recording, Call tracking**

## What it is

Staff call customers from the app (computer or phone) through the business's number. Calls are recorded, transcribed,
summarised and logged, the same as AI calls. A dialer works through a list of calls in a row.

## How it works

1. Rahul opens Today, clicks **Call** on Priya. His phone rings first, then connects to Priya, showing the business's
   number.
2. After the call, the AI writes the summary, updates the lead fields it heard, and suggests the next step.
3. **Dialer:** Rahul starts "Hot leads" and calls each in turn, logging outcomes with one tap.

## Done when

- [ ] Staff calls are logged with recording, transcript and summary.
- [ ] The AI fills lead fields from the staff call (shown for approval).

## Better than HubSpot

- The AI listens to staff calls too and fills in the CRM, so staff don't type notes.

## For developers

- **Code folder:** `apps/api/src/engines/sales/calling`
- **API:** [API.md](../../API.md), Phase 2 → Staff calling and call logging
- **Code:** same telephony provider as Phase 1 calls; click-to-call API; `calls.direction` (`inbound`, `outbound`),
  `calls.by_user_id`.
