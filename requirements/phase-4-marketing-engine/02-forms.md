# Forms

**Phase 4 · Marketing · HubSpot equivalent: Form builder, Form shortening, Lead capture forms**

## What it is

Enquiry forms the business builds by dragging fields (including custom fields) and places on its website, landing
pages, Facebook or Instagram lead ads. Every submission becomes a contact and lead, and gets an instant WhatsApp reply.
Forms skip fields already known for returning visitors.

## How it works

1. Manager builds "Wedding enquiry" with name, phone, date, guests, budget, consent tick.
2. Pastes the code on the website.
3. A visitor submits. Within a minute: contact, lead, WhatsApp reply "Thanks! We'll call you at 4 PM."

## Done when

- [ ] Forms embed on any website; submissions create contacts and leads with source "form: Wedding enquiry".
- [ ] Spam is blocked without a puzzle for real visitors.

## Better than HubSpot

- The AI replies on WhatsApp straight after the form and can carry on the conversation.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/forms`
- **API:** [API.md](../API.md), Phase 4 → Forms
- **Code:** embeddable form script in `apps/site`; Meta lead ads webhook.
- **Tables:** `forms`, `form_fields`, `form_submissions`.
