# Email marketing

**Phase 4 · Marketing · HubSpot equivalent: Email marketing, AI-powered emails, A/B testing, Email templates**

## What it is

Newsletters and offer emails built from blocks or drafted by AI, sent to segments, with opens, clicks and unsubscribes
tracked, and A/B tests of subject lines.

## How it works

1. Manager types "Monsoon offer for families". The AI drafts the email with the business's colours.
2. Manager picks the segment and a send time. Subject A/B test on 20%, the winner goes to the rest.
3. Report: delivered, opened, clicked, replied, leads, revenue.

## Rules

- Sent from the business's own domain once it's verified; unsubscribe link in every email.

## Done when

- [ ] Emails deliver to Gmail inboxes (not spam) from a verified domain; reports are correct.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/email-campaigns`
- **API:** [API.md](../API.md), Phase 4 → Email marketing
- **Provider:** an email sending service (e.g. Amazon SES) with domain verification (SPF, DKIM, DMARC).
- **Tables:** `email_campaigns`, `email_sends`.
