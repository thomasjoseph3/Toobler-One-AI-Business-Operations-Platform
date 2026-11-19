# channel.email: Email

The business connects its enquiry mailbox (IMAP to read, SMTP to send); the AI answers or drafts. See `docs/features/F26-email.md`. A channel module: switched on per business, plug and play.

| Folder          | What is in it                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`       | `email-settings.routes.ts`: `GET/PUT/DELETE /channels/email`, `POST /channels/email/check`, `GET /channels/email/drafts`, `POST .../drafts/{id}/send`, `DELETE .../drafts/{id}` |
| `services/`     | connection settings, the mailbox reader (email → thread → agent → send or draft), drafts, the staff reply sender, the idle-conversation ender                                   |
| `repositories/` | the SQL for `email_connections`, `email_drafts` and the shared message receipts                                                                                                 |
| `helpers/`      | mail server guesses, how the subject is kept in a message, the idle rule (pure). Header and body reading is in `providers/mailbox/mail-parsing.ts`                              |

Reading and sending go through `providers/mailbox` (imapflow, nodemailer), so tests never reach a mail server.
