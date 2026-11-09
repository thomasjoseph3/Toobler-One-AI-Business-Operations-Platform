# WhatsApp

**Phase 1 · Channels · HubSpot equivalent: WhatsApp integration, Mobile messaging, Shared inbox**

## What it is

The AI answers WhatsApp messages sent to the business's WhatsApp number, saves the lead, and can send offering details
and follow-ups using approved templates.

## Why it matters

WhatsApp is how most Indian customers prefer to enquire, and they expect a reply within minutes.

## How it works

1. Priya messages "Rooms for 4 in Dec?" to the business's WhatsApp.
2. Meta sends the message to us. The number tells us which business it is.
3. The AI replies, asks her dates, saves the lead, promises a callback.
4. She asks for the details; the AI sends the offering on an approved template.
5. Staff see the chat in the [inbox](../4-staff-workspace/02-inbox.md) and can [take over](07-staff-takeover.md).

**Voice notes:** the AI replies asking for text, until transcription is added.

**The 24-hour rule:** replies are free for 24 hours after the customer's last message. After that only approved
templates can be sent.

**Connecting a number:** to begin with, we add each business's number to our WhatsApp account. Later, Meta Embedded
Signup lets a business connect its own number during setup.

## Rules

- Every incoming message is checked to be really from Meta before we trust it.
- The AI never messages anyone who hasn't messaged first, except approved follow-up templates to existing leads.

## Screens

- **Channels → WhatsApp:** connected number, status, templates and their approval state.

## Done when

- [ ] A WhatsApp message gets an AI reply within 10 seconds.
- [ ] Each conversation creates or updates one contact and lead.
- [ ] Messages outside the 24-hour window go only as approved templates.

## Better than HubSpot

- WhatsApp is a main channel with an AI that answers, not an add-on for staff to type in.

## For developers

- **Code folders:** `apps/api/src/channels/whatsapp`, `apps/api/src/agents/text`
- **API:** [API.md](../../API.md), Phase 1 → WhatsApp
- **Webhook:** `POST /webhooks/whatsapp` with the Meta verify token and an `X-Hub-Signature-256` check.
- **Code:** the same text agent as website chat (`agents/text`); sending and templates in `channels/whatsapp`
  (templates `offering_details`, `new_lead_alert`, `callback_reminder`).
- **Tables:** `connections` (kind `whatsapp`), `chats` (channel `whatsapp`).
