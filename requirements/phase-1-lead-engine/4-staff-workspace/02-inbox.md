# Inbox

**Phase 1 · Staff workspace · HubSpot equivalent: Shared inbox, Conversations inbox, Omnichannel communication**

## What it is

One list of every conversation from every channel (calls, WhatsApp, website chat, email), newest first, each linked to
its contact and lead.

## Why it matters

Today staff check four places. One inbox means nothing is missed.

## How it works

1. Rahul opens **Inbox**. He sees all conversations, with a channel icon, contact name, summary and status.
2. Filters: channel, open or done, held by me, needs a person.
3. He opens a WhatsApp chat, reads it, [takes over](../3-ai-agents-and-channels/07-staff-takeover.md) and replies.
4. He opens an email draft the AI wrote, edits it and sends.
5. He marks the conversation **Done**.

## Rules

- A conversation that needs a person (customer asked for one, complaint, AI unsure) is marked and sorted first.
- Replies go out on the channel the customer used.

## Done when

- [ ] Calls, WhatsApp, chat and email all appear in one list within seconds.
- [ ] Staff can reply to WhatsApp, chat and email from the inbox.
- [ ] Filters and Done work.

## For developers

- **Code folder:** `apps/api/src/core/conversations`
- **API:** [API.md](../../API.md), Phase 1 → Inbox
- **Columns:** `needs_person`, `done_at` on each conversation table.
