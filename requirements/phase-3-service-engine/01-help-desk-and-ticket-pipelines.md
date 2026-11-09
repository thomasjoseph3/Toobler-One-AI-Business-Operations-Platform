# Help desk and ticket pipelines

**Phase 3 · Service · HubSpot equivalent: Help desk workspace, Ticketing, Multiple ticket pipelines**

## What it is

Phase 1 tickets (Open → Done) become a full help desk: stages the business sets (New, Waiting on us, Waiting on
customer, Closed), priorities, categories, several pipelines (e.g. "Complaints", "Maintenance"), and one workspace where
staff work through tickets.

## Why it matters

As a business grows, service requests need the same order and follow-through as sales.

## How it works

1. A guest emails about a broken AC. The AI raises a ticket in "Maintenance", priority High.
2. Staff open **Help desk**, see tickets by stage and priority, reply on the customer's channel from the ticket.
3. The ticket moves to "Waiting on customer" when staff reply, and back when the customer replies.
4. Closed tickets trigger a [survey](07-feedback-surveys.md).

## Done when

- [ ] Several pipelines with custom stages work; replies from the ticket reach the customer.
- [ ] Stages change automatically on replies.

## For developers

- **Code folder:** `apps/api/src/engines/service/helpdesk`
- **API:** [API.md](../API.md), Phase 3 → Help desk and ticket pipelines
- **Tables:** `tickets` gains `pipeline_id`, `stage_id`, `priority`, `category`; reuse `pipelines` and
  `pipeline_stages` with `object = 'ticket'`.
