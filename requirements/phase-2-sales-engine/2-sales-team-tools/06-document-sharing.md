# Document sharing

**Phase 2 · Sales tools · HubSpot equivalent: Documents, Document tracking**

## What it is

A library of brochures, menus, price sheets and photos. Staff and the AI send them as links and see when the customer
opened them and for how long.

## How it works

1. Manager uploads "Wedding packages.pdf".
2. The AI, when asked about weddings, sends it on WhatsApp.
3. The timeline shows "Opened, 3 min, pages 2–4".

## Done when

- [ ] Documents send from inbox and AI; views are tracked.

## For developers

- **Code folder:** `apps/api/src/engines/sales/documents`
- **API:** [API.md](../../API.md), Phase 2 → Document sharing
- **Tables:** `documents`, `document_views`. Files in object storage with signed links.
- **Agent tool:** `send_document`.
