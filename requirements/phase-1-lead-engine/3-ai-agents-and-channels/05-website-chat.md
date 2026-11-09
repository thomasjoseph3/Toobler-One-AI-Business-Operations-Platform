# Website chat

**Phase 1 · Channels · HubSpot equivalent: Live chat, Chatbot builder, Chat widget**

## What it is

A chat bubble on the business's own website. Visitors type a question; the AI answers and saves the lead. A "Call us"
button lets them talk to the voice agent from the browser.

## Why it matters

Website visitors leave in seconds if nobody answers. A chat that answers at once keeps them.

## How it works

1. The setup screen gives the business one line of code (or a WordPress plugin) to paste into its website.
2. A visitor opens the bubble and asks a question. The AI answers.
3. When the visitor gives a phone number or email, they become a contact with a lead.
4. The bubble's colour, greeting and position are set by the business.

## Rules

- The widget only works on the website addresses the business lists.
- It loads without slowing the website.

## Screens

- **Channels → Website chat:** code to copy, colour, greeting, allowed websites, preview.

## Done when

- [ ] Pasting the code on a test site shows the bubble and the AI answers.
- [ ] A chat that gives a phone number creates a contact and lead.
- [ ] The web call button connects to the voice agent.

## For developers

- **Code folders:** `apps/api/src/channels/webchat`, `apps/api/src/agents/text`, `apps/site` (widget)
- **API:** [API.md](../../API.md), Phase 1 → Website chat
- **Settings:** `accounts.widget` (jsonb: colour, greeting, position, allowed websites).
