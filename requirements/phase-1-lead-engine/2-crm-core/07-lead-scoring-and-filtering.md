# Lead scoring and filtering

**Phase 1 · CRM core · HubSpot equivalent: Lead scoring, Contact scoring**

## What it is

Every lead is marked **hot**, **warm** or **cold** by fixed rules, with the reason shown. Calls and messages that are
not real enquiries (wrong numbers, silent calls, spam) are filtered out so they don't clutter the board.

## Why it matters

Staff have limited time. Scoring tells them who to call first. Filtering stops them wasting time on junk.

## How it works

| Temperature | Rule (any one is enough) |
| --- | --- |
| Hot | Asked to book or for a payment link; or gave dates within 30 days and asked the price |
| Warm | Gave dates, or asked the price |
| Cold | Only general questions |

**Filtered out** (kept under a "Filtered" tab, not on the board): calls under 10 seconds with no speech; wrong numbers;
spam and sales pitches to the business; existing customers' service questions (these become
[tickets](../4-staff-workspace/06-tickets.md)).

The reason is shown on the card: "Hot: dates 12–15 Dec and asked the price".

## Rules

- Scoring is done by code from what the AI recorded, not by the AI's opinion, so the same facts always give the same
  answer.
- Staff can change a temperature by hand; that wins until the next conversation.
- Phase 5 lets businesses write their own scoring rules.

## Done when

- [ ] Test conversations for each rule give the expected temperature and reason.
- [ ] Silent, wrong-number and spam conversations land under Filtered, not on the board.
- [ ] Staff can move a filtered item back to the board.

## Better than HubSpot

- Works from the actual conversation, including phone calls in Malayalam and Hindi, not only from email opens and page visits.

## For developers

- **Code folder:** `apps/api/src/core/leads` (`score.ts`: pure functions, a unit test per rule)
- **API:** [API.md](../../API.md), Phase 1 → Lead scoring and filtering
- **Columns:** `leads.temperature`, `leads.temperature_reason`, `leads.temperature_set_by`; `leads.filtered_reason`.
- **Agent:** `save_lead` records the facts (`asked_price`, `asked_to_book`, dates); the score is computed after.
