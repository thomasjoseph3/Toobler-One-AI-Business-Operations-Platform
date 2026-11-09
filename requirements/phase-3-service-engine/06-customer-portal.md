# Customer portal

**Phase 3 · Service · HubSpot equivalent: Customer portal**

## What it is

A private page where a customer signs in with a WhatsApp code and sees their own tickets, bookings, quotes, invoices and
payments, and can raise a new request.

## How it works

1. Priya taps "My account" in any message.
2. She enters her mobile and the WhatsApp code.
3. She sees her stay, invoice and open request, and can reply or download.

## Done when

- [ ] Customers see only their own records; sign-in by WhatsApp code works.

## For developers

- **Code folder:** `apps/api/src/engines/service/portal`
- **API:** [API.md](../API.md), Phase 3 → Customer portal
- **Tables:** `portal_sessions`; read-only routes scoped to one contact.
- **Code:** customer page in `apps/site/app/[slug]/account`.
