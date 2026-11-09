# Email tracking and mail extensions

**Phase 2 · Sales tools · HubSpot equivalent: Email tracking, Gmail/Outlook integration, Sales extensions**

## What it is

Staff connect their own Gmail or Outlook. Emails they send and receive with contacts are logged on the timeline. Staff
see when a customer opens an email or clicks a link. A browser extension shows the contact's details next to their
email in Gmail.

## How it works

1. Rahul connects Gmail. Emails with known contacts appear on their timelines.
2. He sends a quote from Gmail with tracking on. He gets a notice: "Priya opened your email."
3. In Gmail, a side panel shows Priya's leads and tasks; he adds a task without leaving Gmail.

## Rules

- Only emails with existing contacts are logged; personal emails stay private.
- Open tracking is labelled "approximate" because some mail apps block or fake it.

## Done when

- [ ] Logging, open and click tracking, and the extension work with Gmail and Outlook.

## For developers

- **Code folder:** `apps/api/src/engines/sales/mail-sync`
- **API:** [API.md](../../API.md), Phase 2 → Email tracking and mail extensions
- **Code:** Gmail API, Microsoft Graph; tracking pixel and link redirects; Chrome extension in `apps/extension`.
