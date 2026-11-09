# Activity timeline and notes

**Phase 1 · CRM core · HubSpot equivalent: Activity timeline, Notes, Call logging, Conversation summaries**

## What it is

The timeline is a list of everything that happened with a contact or lead, newest first: calls (with recording and
transcript), WhatsApp messages, chats, emails, notes, stage changes, tasks and alerts. Each conversation has a short
summary the AI writes.

## Why it matters

Anyone on the team can pick up a customer without asking "what happened last time?"

## How it works

1. Priya's call ends. A line appears: "Call, 4 min, AI agent. Wants 3 nights in Dec for 4. Asked about pool. Promised
   callback 9 AM." Click to hear the recording or read the transcript.
2. Rahul adds a note: "Prefers ground floor, mother uses a wheelchair."
3. He moves the lead to Quoted; a line says so.
4. Staff can filter the timeline to only calls, only notes, and so on.

## Rules

- Summaries are 2–3 lines, written from the transcript, and never add facts that weren't said.
- Notes can be edited by their writer and deleted (with "Are you sure?") by a manager.
- A contact's timeline shows the activity of all their leads; a lead's timeline shows only its own.

## Screens

- **Timeline** on contact, company and lead pages, with filter chips and an Add note box.

## Done when

- [ ] Every call, chat, WhatsApp message, email, note and stage change appears on the right timeline within seconds.
- [ ] Every conversation has an AI summary.
- [ ] Recordings and transcripts open from the timeline.

## Better than HubSpot

- Every conversation is summarised automatically, in every language, including phone calls.

## For developers

- **Code folder:** `apps/api/src/core/activities`
- **API:** [API.md](../../API.md), Phase 1 → Activity timeline and notes
- **Table:** `activities` (`account_id`, `contact_id`, `lead_id`, `kind` in `call`, `chat`,
  `whatsapp`, `email`, `note`, `stage`, `task`, `alert`, `ref_id`, `summary`, `body` (notes), `by_user_id`, `by_agent`,
  `created_at`).
