# Email

**Phase 1 · Channels · HubSpot equivalent: Team email, Shared inbox, Email logging**

## What it is

The business connects its enquiry mailbox. The AI reads new emails, sorts them, and drafts or sends replies. Enquiries
become leads; other emails become tickets or are ignored.

## Why it matters

Email enquiries often wait a day for a reply. A reply within minutes wins the customer.

## How it works

1. The manager connects the mailbox (Gmail, Outlook or any IMAP mailbox).
2. Every few minutes we read new emails and sort them: enquiry, existing customer, question, complaint, automatic
   (newsletters, receipts).
3. Enquiries: the AI replies (or drafts for approval, as the business chooses) and saves the lead.
4. Complaints and past orders: a ticket is raised.
5. Automatic emails are ignored.

## Rules

- Emails whose sender fails the email security check are never auto-answered.
- The business chooses per kind: "AI sends" or "AI drafts, staff approve".

## Screens

- **Channels → Email:** connected mailbox, status, reply mode per kind.

## Done when

- [ ] A new enquiry email gets a reply or a draft within the check interval, and creates a lead.
- [ ] Newsletters and receipts are ignored.

## For developers

- **Code folders:** `apps/api/src/channels/email`, `apps/api/src/agents/email`
- **API:** [API.md](../../API.md), Phase 1 → Email
- **Code:** mailbox reading (Gmail API, Microsoft Graph, IMAP) in `channels/email`; sorting and replies in
  `agents/email`. Categories: `enquiry`, `existing_customer`, `question`, `complaint`, `other`, `automated`.
- **Tables:** `emails`, `connections` (kind `email`).
