# F26 Email

**Status:** in_review · **Requirement:** `requirements/phase-1-lead-engine/3-ai-agents-and-channels/06-email.md`

## Feature guide

**What it does.** The business connects the mailbox customers write to (Gmail, Outlook or any other mailbox that supports IMAP). Every two minutes the AI
reads the new emails from customers, writes the reply and either sends it or keeps it as a draft for a team member to approve, as the manager chose. The
enquiry is saved as a conversation under the customer's email address, and the usual sorting afterwards makes the contact and the lead. When the customer
answers, their reply joins the same conversation.

**Why it is useful.** Email enquiries often wait a day for a reply. A reply within minutes wins the customer, and the team does not read the inbox to find the enquiries.

**A day in the life.** At 11 pm Priya emails "Rooms for 4 in December". The AI reads it, drafts a reply with the right rooms and asks her dates. In the morning
Anita opens Channels → Email, sees the draft, changes one line and presses "Send this reply". Priya gets it in her normal email thread.

**Who can do what.** Only managers connect the mailbox, choose how the AI answers, and approve or discard drafts. Staff see email conversations in the Inbox and, after "I'll handle this", reply there; the reply goes out by email.

**Settings and limits.** The password is stored scrambled and never shown again (for Gmail or Outlook, make an "app password"). "Ask for approval first" (the default) or "Let the AI send". Reading can be paused. Up to 40 emails are read per check, newest first. A thread quiet for two days ends and is sorted and summarised.

**What it never does.** It never answers newsletters, receipts, notifications, mailing lists or bounces (decided from the email's headers). It never answers an email whose sender our mail server could not verify: the email is saved for the team only. It never answers for a business that has not gone live. It never deletes, moves or marks any email as read in the mailbox. It does not answer an email your team has already answered from their own mail app.

**Not part of it.** Signing in with Google or Microsoft (OAuth), attachments, a different reply mode per kind of email (one mode for all this time, R82), outgoing-only email.

## For the tech team

- **Module:** `channel.email` (`apps/api/src/modules/channels/email`). Must be entitled for the business (platform step, like WhatsApp).
- **Tables (migration 073):** `email_connections` (one per business, password AES-256-GCM via core.ai's secret box), `email_drafts`; message ids are kept in the shared `channel_message_receipts` (channel `email`).
- **Routes (managers):** `GET/PUT/DELETE /api/v1/channels/email`, `POST /api/v1/channels/email/check`, `GET /api/v1/channels/email/drafts`, `POST /api/v1/channels/email/drafts/{id}/send`, `DELETE /api/v1/channels/email/drafts/{id}`.
- **Jobs:** `email.find_mailboxes` (every 2 min) → `email.read_mailbox` per business; `email.find_idle_conversations` (every 30 min) → `email.end_idle_conversations`.
- **How an email flows:** provider reads unanswered mail (headers, Authentication-Results, text without quoted history; automated mail dropped) → claim Message-ID → thread found from In-Reply-To/References against saved `channel_message_id`s → sender check `fail`: save only → else `answerAndSave` (subject kept on the first line of the customer message) → send by SMTP (threaded) or save a draft. The read point only moves on when every email was handled (5 minutes of overlap).
- **Seams:** `providers/mailbox` (imapflow 2.10.2 for IMAP, existing nodemailer for SMTP; tests use a scripted provider). Job runner now gives jobs `registry`, `gate` and `services.mailbox`; event handlers get `services.mailbox`.
- **Reused from the hotel agent:** IMAP reader, header parsing, sender check from Authentication-Results, automated-mail detection, quote cutting, HTML to text. **Changed:** TypeScript and our repository layout; one conversation per thread through our conversation engine instead of a separate inbox store; the agent is the shared text agent; drafts are a table; no mail-parsing package.
- **Known limits:** in draft mode the AI's text is already in the conversation as the agent's message even before a person approves it; IMAP only over TLS (993); Gmail needs an app password (2-step verification on); Outlook personal accounts may block app passwords; the Sent-folder "already answered" check needs a folder marked as Sent.

## Manual test script

1. Platform: entitle `channel.email` for the business. Make an app password for a test Gmail address (2-step verification on).
2. Channels → Email: address, app password → Connect → **Check connection** shows "Working".
3. Complete "Go live". From another address send an enquiry ("Rooms for 4 in December?"). Within about two minutes a draft appears under "Replies waiting for approval".
4. Edit a line and **Send this reply**: it arrives in the same thread. Send a newsletter-style mail (or one with `List-Unsubscribe`): nothing happens.
5. Switch to "Let the AI send" and repeat. In the Inbox, take over an email conversation and reply: it goes out by email.
