# Email and WhatsApp templates, snippets and scheduling

**Phase 2 · Sales tools · HubSpot equivalent: Email templates, Snippets, Email scheduling, AI email writer**

## What it is

Saved messages staff reuse (with the customer's name and details filled in), short snippets for common answers, an AI
that drafts a reply from the conversation, and "send later".

## How it works

1. Rahul types "/price" in a reply; the snippet "Our rates start from…" drops in.
2. He picks the template "Quote follow-up"; {first name} and {dates} fill in.
3. He clicks **AI draft**, and the AI writes a reply from the conversation; he edits it.
4. He picks **Send tomorrow 9 AM**.

## Done when

- [ ] Templates, snippets, AI drafts and scheduled sends work in email and WhatsApp replies.
- [ ] Template use is reported (sent, replied).

## For developers

- **Code folder:** `apps/api/src/engines/sales/templates`
- **API:** [API.md](../../API.md), Phase 2 → Email and WhatsApp templates, snippets and scheduling
- **Tables:** `message_templates` (`account_id`, `channel`, `name`, `body`, `shared`), `snippets`,
  `scheduled_messages`.
