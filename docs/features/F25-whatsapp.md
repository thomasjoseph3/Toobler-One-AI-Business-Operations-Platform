# F25 WhatsApp

**Status:** approved 19 Nov 2026 by Claude under the standing instruction after the checks passed (the owner has not tested it by hand) · **Branch:** `feature/F23-staff-alerts` (built on the owner's F22/F23 branch; F23 itself is deferred, R81) · **Requirement:** `requirements/phase-1-lead-engine/3-ai-agents-and-channels/04-whatsapp.md`

## Feature guide

**What it does.** Customers message your business's WhatsApp number and the AI answers within seconds, in the same way it answers on your website chat. Every
message arrives with the customer's own phone number, so nobody signs in and the AI never has to ask for a number: the conversation is filed under that
number, and the usual sorting afterwards creates (or finds) the contact and the lead. Your team sees the conversation in the Inbox, can click "I'll handle
this" and reply, and that reply goes out on WhatsApp.

**Why it is useful.** Most customers prefer WhatsApp, and expect an answer in minutes, including at night.

**A day in the life.** Priya messages "Rooms for 4 in Dec?" at 10 pm. The AI answers, asks her dates, saves the details and promises a callback. Next morning
Anita opens the Inbox, sees the chat, takes it over and types "Hi Priya, this is Anita". Priya gets it on WhatsApp.

**Who can do what.** Only managers connect, check, pause or disconnect the number (Channels → WhatsApp). Staff read the conversations in the Inbox and reply
after taking over.

**Settings and limits.** You give the app your number's ID and a permanent access token from Meta (the token is stored scrambled and never shown again). "Pause
the AI" stops the answers but keeps the settings. A reply from a team member goes out only within 24 hours of the customer's last message (WhatsApp's rule);
after that the screen says so, because only approved templates are allowed. A conversation quiet for six hours ends and is sorted and summarised; the customer's next message starts a new one. One customer may send 15 messages a minute.

**What it never does.** It never messages anyone who has not messaged first. It does nothing for a business that has not gone live, has paused the AI or has WhatsApp switched off. It cannot read voice notes or photos yet: it asks the customer to type.

**Not part of it.** Approved message templates (follow-ups, offering details, F27), staff alerts on WhatsApp (F23), connecting a number through Meta's Embedded Signup.

## For the tech team

- **Module:** `channel.whatsapp` (`apps/api/src/modules/channels/whatsapp`). Needs it entitled for the business (platform step: insert `account_modules` row, or the platform console later).
- **Tables (migration 072):** `whatsapp_connections` (one per business; `phone_number_id` unique across businesses; token AES-256-GCM via core.ai's secret box, tied to the business), `channel_message_receipts` (WhatsApp message ids, for once-only answers; cleaned after 7 days).
- **Env (platform's Meta app):** `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. Meta webhook: `https://<public address>/webhooks/whatsapp` (field `messages`). Needs a public HTTPS address.
- **Routes:** `GET/PUT/DELETE /api/v1/channels/whatsapp`, `POST /api/v1/channels/whatsapp/check` (managers); `GET/POST /webhooks/whatsapp` (public, signature-checked, rate limited; CSRF exempt because of the signature).
- **How an inbound message flows:** raw body → `X-Hub-Signature-256` check → `200` at once → per-customer queue → business from `phone_number_id` (system lookup) → module on? AI on? business live? → claim message id → open conversation of that number or new → `createAgentSavedTurnService.answerAndSave` → reply via `app.kernel.whatsapp` (provider seam; tests use a recorder).
- **Staff replies:** `conversation.message` event now carries `messageId`; this module's handler sends staff messages of WhatsApp conversations (24-hour rule). Event handlers now receive `services` (config, database, providers). The takeover `reply` route no longer refuses WhatsApp.
- **Jobs:** `whatsapp.find_idle_conversations` (every 10 min) → `whatsapp.end_idle_conversations` (queues sorting and summary, marks ended).
- **Reused from the hotel agent:** Meta send/check calls, signature check, message parsing, WhatsApp text formatting, typing indicator. **Changed:** one number = one business (no shared-number menu, per requirement), TypeScript, repository pattern, token per business via the AI secret box, once-only receipts in the database instead of memory.
- **Known limits:** the AI's answer is produced after the `200` inside the API process (a crash in those seconds loses that one answer; Meta will not retry). Media and voice notes are not read. No templates. One Meta app secret for the whole platform (businesses using their own Meta app are a later step).

## Manual test script

1. Platform: set `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` in `.env`, run `npm run db:migrate`, expose the API on a public HTTPS address, and entitle `channel.whatsapp` for the business (platform step).
2. In Meta (Developers → your app → WhatsApp → Configuration): callback URL and verify token from Channels → WhatsApp → verify and save; subscribe to `messages`.
3. Channels → WhatsApp: enter the Phone number ID and access token → Connect → **Check connection** shows "Working" and the number.
4. Complete the setup wizard's "Go live", then message the number from another phone: the AI replies in seconds; the Inbox shows the conversation with your number.
5. In the Inbox: "I'll handle this", send a reply: it arrives on WhatsApp. Pause the AI: new messages get no answer.
