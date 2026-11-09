# Follow-ups

**Phase 1 · Staff workspace · HubSpot equivalent: Sequences (basic), Email scheduling**

## What it is

When a lead goes quiet, the AI writes a polite follow-up message and staff approve it with one tap. Once a business
trusts a kind of follow-up, it can let the AI send it automatically. Follow-ups stop the moment the customer replies.

## Why it matters

Most sales are lost to silence, not to "no". A follow-up on day 2 and day 5 brings many back.

## How it works

1. Priya was quoted on Monday and hasn't replied.
2. On Wednesday the AI drafts: "Hi Priya, just checking if you had any questions about your December stay."
3. Rahul sees it on Today, taps **Send** (or edits first).
4. If no reply, a second draft on day 5. Then the lead is marked "no reply".
5. If Priya replies at any point, all follow-ups stop.

**Default plan** (changeable): day 2 and day 5 after the last message, for leads in Contacted or Quoted.

## Rules

- WhatsApp follow-ups after 24 hours use approved templates.
- Never more than two follow-ups per lead unless staff add more.
- Never to a contact who said stop.

## Done when

- [ ] Drafts appear on the right days.
- [ ] A customer reply cancels pending follow-ups.
- [ ] "Send automatically" works per kind once switched on.

## Better than HubSpot

- HubSpot sequences need someone to write each message. Ours are written by the AI from the actual conversation.

## For developers

- **Code folder:** `apps/api/src/engines/leads/followups`
- **API:** [API.md](../../API.md), Phase 1 → Follow-ups
- **Tables:** `follow_ups` (`account_id`, `lead_id`, `due_at`, `channel`, `draft`, `status` in
  `pending`/`approved`/`sent`/`cancelled`, `approved_by`), `follow_up_settings` per account.
- **Jobs:** draft and send checks in the job runner.
