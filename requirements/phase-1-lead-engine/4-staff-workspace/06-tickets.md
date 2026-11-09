# Tickets

**Phase 1 · Staff workspace · HubSpot equivalent: Ticketing (basic)**

## What it is

A ticket is a request that isn't a sale: a complaint, a question about a past order, something the AI can't answer.
The AI raises tickets; staff work on them and close them.

## Why it matters

Keeping these off the leads board keeps sales clean, and makes sure unhappy customers get an answer.

## How it works

1. A past customer calls about a refund. The AI says "I've passed this to the manager" and raises a ticket.
2. The manager sees it in **Tickets** and gets an alert.
3. They call the customer and close the ticket with a note.

**Status:** Open → Done. (Full help-desk stages, routing and response targets come in Phase 3.)

## Done when

- [ ] Complaints and non-sales requests become tickets linked to the contact.
- [ ] Staff can assign, note and close tickets.

## For developers

- **Code folder:** `apps/api/src/core/tickets`
- **API:** [API.md](../../API.md), Phase 1 → Tickets
- **Table:** `tickets` (`type`: `callback`, `question`, `complaint`, `existing_customer`, `other`; `status`: `open`,
  `done`; `contact_id`, `owner_user_id`).
