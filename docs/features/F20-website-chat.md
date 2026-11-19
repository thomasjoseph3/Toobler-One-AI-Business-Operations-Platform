# F20: Website chat (the first channel)

**Requirements:** `3-ai-agents-and-channels/05-website-chat.md`; docs/plan/PHASE-1.md (F20); docs/ARCHITECTURE.md §2 (the conversation engine and `ChannelAdapter`); docs/SECURITY.md (public routes and the widget); `requirements/API.md` (Website chat)
**Depends on:** F03, F15, F19, F37      **Module:** `channel.webchat` (a channel module: switched on per business, plug and play)
**Status:** `approved` by the owner on 16 Nov 2026 (all five slices built and tested; `npm run verify` green)

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
It puts a chat bubble on your own website. A visitor taps it and talks to your AI agent (the one from F19) in writing, in English. The agent answers from what you have told Toobler One, asks for the visitor's name and phone number, and makes the one promise ("our team will call you within 15 minutes"). When the chat is over, the system sorts it like every other conversation: an enquiry becomes a **lead** with a **contact**, a complaint becomes a **ticket**, and a short **summary** is written for your team.

The bubble can also show a **Call** button (it opens the phone app with your number) and a **WhatsApp** button (it opens WhatsApp with your number and a ready-typed message). These two are simple links: they need nothing else set up, and you choose which buttons show and in what order.

### Why it is useful
- **No visitor is lost.** Somebody browsing at 11 pm gets an answer at once and leaves a number, instead of closing the tab.
- **One line to install.** You paste one line of code into your website. Nothing else changes on your page, and the bubble never slows it down.
- **Only your websites.** The chat works only on the websites you list. Another website that copies your line gets nothing.
- **You stay in control.** You can switch the whole chat off in Settings, and your data is kept.

### How it works: a day in the life
1. The manager opens the chat settings (the screen is being designed; for now Postman), sets the colour and the greeting, lists `https://nairstays.example` as the allowed website, adds the phone and WhatsApp numbers, and pastes the one line into the website.
2. Ravi visits the website at night. A blue bubble with Chat, Call and WhatsApp buttons appears in the corner.
3. He taps Chat. The window says *"AI assistant"* and greets him. He writes: *"Do you have a room next weekend?"* and, when asked, *"I'm Ravi, 98470 12345."* The agent says: *"Thank you, Ravi. Our team will call you within 15 minutes."*
4. Ravi's page reloads by accident: the chat is still there. He closes the window and leaves.
5. After **15 minutes of silence** the chat ends by itself. The system sorts it as an enquiry, makes the contact "Ravi" with his phone number, makes a lead, and writes the summary.
6. In the morning the manager sees the lead with the summary. Another visitor who complained about the air conditioning got a ticket instead, and no lead.

### Who can do what
- **Managers** change the chat settings. **Staff** can read them (and the code to paste).
- **Visitors** need no sign-in: they can only chat, read their own chat, and end it.
- The role "own leads only" cannot see the settings.

### Settings and limits
| What | Value |
| --- | --- |
| Colour, greeting, corner (left or right) | Chosen by the manager. Starts as near-black, "Hi! How can I help you today?", bottom right. |
| Allowed websites | Up to 20, each written as an address like `https://nairstays.example` (no page, no wildcard). **Empty means the chat works nowhere**, so a new business is safe until it lists its site. |
| Call and WhatsApp buttons | Each shows only when its number is set. The manager chooses their order. The Chat button cannot be left out. |
| A message | Up to 1,000 characters. |
| A chat | Up to 100 messages; it ends after 15 minutes of silence, or when the visitor taps **End chat**. |
| Limits per connection | 20 messages a minute, 10 new chats an hour. 120 messages a minute for the whole business. |
| Language | English only. |

### What it never does
- It never shows one business's chat to another, or lets a visitor read anyone else's chat.
- It never lets a website that is not on your list use your chat.
- It never makes a lead or a contact while the chat is still going, and never for a chat where nobody gave a phone number or email (a person looks at those).
- It never shows the visitor technical errors, and never writes the visitor's words to the log.
- It never gives a price the business did not state, or a second promise (that is the agent's rule, from F19).

### What is not part of it
- The **Channels, Website chat screen** (colour picker, preview, "Check installation"): it is with the designer; until then Postman and the test page are used.
- **Word-by-word replies** (the reply appears all at once), the **in-browser call** (the Call button is a plain phone link until voice arrives), the **WhatsApp AI chat**, the **WordPress plugin**, and staff **taking over** a chat (the inbox, F21).

### For the tech team
- **Module:** `channel.webchat` (kind channel; requires core.auth, core.conversations, core.agents, core.ai). Off means its routes answer 404, its jobs are skipped, and data is kept.
- **Tables:** `webchat_settings` (migration 040; one row per business, made on first read; the widget key is never updatable). Migration 041 lets a web chat fill in `conversations.from_phone_key` and `from_email` once (a trigger forbids changing or clearing them afterwards).
- **Routes:** `GET` and `PATCH /api/v1/channels/webchat` (settings). Public: `GET /api/v1/public/widget/{key}/config`, `GET` and `POST .../messages`, `POST .../end`, each with `OPTIONS` for the browser's permission check. Files (outside `/api/v1`): `/widget/loader.js`, `/widget/assets/{file}`, `/widget/chat?key=`, and `/widget/test?key=` (not in production).
- **Jobs:** `webchat.find_idle_chats` (every minute, finds businesses with chats quiet for 15 minutes) and `webchat.end_idle_chats` (per business: queues `conversations.sort_conversation` and `agents.summarise_conversation`, then marks the chat ended). A visitor's End chat does the same through `handOverChat`. Routes queue jobs through `app.kernel.enqueueJob`.
- **How a message flows:** key finds the business (the one cross-business lookup) → module on? → website allowed (or the chat window's own same-origin call while a website is listed)? → visitor token (HS256, 24 hours, key derived from the app secret, tied to business and conversation) → limits → `createAgentSavedTurnService` (shared with Test the agent) → conversation and messages saved → phone or email the agent saved is linked → new token.
- **Widget:** `apps/site` (React 19 + Vite) builds the chat window; `public/loader.js` is plain JavaScript. The API serves `apps/site/dist` (or `WIDGET_FILES_DIRECTORY`). Run `npm run build:widget` after changes and on deploy. The chat page's policy allows no inline code and lets only the listed websites frame it; every other page stays unframeable.
- **Known limits:** the per-key and new-chat limits live in server memory (one server); a visitor message is lost if the AI stays down (the visitor is told and can resend); a very long chat is not summarised as it grows (only the last 30 messages are shown to the agent); websites with a strict Content-Security-Policy need to allow the chat service address; callback minutes are fixed at 15 (F19); an idle business with the chat switched off keeps its quiet chats open until it is switched on again; one chat window per browser and business.

## Scope

- **In:**
  - **Settings of the chat bubble:** colour, greeting, position, the websites it may appear on, the one line of code to paste, and "last seen on <website> today" (`GET` and `PATCH /channels/webchat`).
  - **The public chat routes** a visitor's browser calls (no sign-in): `GET /public/widget/{key}/config`, `POST /public/widget/{key}/messages`, `POST /public/widget/{key}/end` and `GET /public/widget/{key}/messages` (resume a chat after a page reload). The business comes only from the widget key. Only the business's own websites may use them (Origin check), with a visitor session token per chat, size limits and rate limits per address and per key.
  - **The chat is a real conversation** (not a test): the visitor's and the agent's messages are saved on a `webchat` conversation, the agent (F19) answers, and when the visitor gives a phone number or email the conversation is linked to them, so the router can make the contact and the lead when it is sorted.
  - **The chat ends and is sorted:** after **15 minutes of silence** (owner decision), or when the visitor closes the bubble, a job marks the chat ended and queues the existing sorting (`conversations.sort_conversation`: type, lead or ticket) and the summary (`agents.summarise_conversation`).
  - **The widget**, served from the API's own address while hosting is undecided (owner decision): a tiny plain-JavaScript loader (no React, so it never slows the customer's website) that shows the launcher buttons and opens the chat window, and the chat window itself, **React in an iframe** (owner decision: the plan's way), with the greeting, the messages, an input and an "AI assistant" label. Phone first.
  - **Three launcher buttons** (owner, 16 Nov 2026): **Chat** (this feature), **Call** and **WhatsApp**. Call and WhatsApp are plain links: `tel:` to the business's phone number and `wa.me` to its WhatsApp number with an optional ready-typed message. They need no channel behind them, so they work from day one and are simple; the browser call (microphone, voice agent) replaces the `tel:` link when voice arrives (F29). Each button shows only when its number is set, and the business chooses their order.
  - A **test page** on the API (development only) to try the widget on, and a Postman collection.
- **Out (later feature / phase):**
  - **Word-by-word streaming** of the reply (owner decision: plain replies first; streaming is its own later slice, because the reply must be checked for amounts before it is shown).
  - The **in-browser call** (microphone, voice agent, F29) and the **WhatsApp AI chat** (F25): the Call and WhatsApp buttons here are plain links only.
  - The **WordPress plugin** and per-platform install steps, the strict-CSP entries page: later, with the setup screen.
  - The **Channels → Website chat screen** (code to copy, colour, greeting, allowed websites, live preview): parked with the designer like every other screen. The API and Postman come first.
  - Staff taking over a chat (F21), alerts about a new lead (F23), the running summary for very long chats (known limit of F19: arrives here only if chats show they need it).

## Reused from the hotel agent

- **Read:** `backend/src/agent/chat/chatRoutes.js` (public routes, rate limit per address, resume a chat), `chat.js` (a turn: history, memory, the cut-off reply), `chatMemory.js`, and the site's `chat-widget.tsx` and `lib/chat.ts` (the browser side: the chat id kept in `localStorage`, resume within a time window, the visitor's phone and email shared with the call dialog, the SSE client).
- **Reused (the ideas, rewritten for our design):** a public route per business with a limit per address; the chat id kept in the browser so a returning visitor resumes; the greeting and the quiet "the assistant is unavailable" message when the AI fails; the visitor's contact details reaching the agent.
- **Changed:** the business is found by a **widget key**, not a slug; a **signed visitor session token** (not just a chat id) proves a browser owns a chat, so nobody can read another visitor's chat by guessing an id; **allowed websites** are checked on every public call (the old project accepted any page); the history lives in our `conversations` and `conversation_messages` tables, not a separate chat collection; the end of a chat is decided on the **server** (15 minutes of silence) and runs the existing sorting and summary, instead of a 6-hour window kept in the browser.
- **Left behind for now:** streaming (SSE) and the reset event, the call dialog (voice), the Next.js site (the widget is plain files served by the API).

## Database

Migration `040_webchat_settings.sql` (final names set when built):

- `webchat_settings` (one row per business): `account_id` (primary key), `widget_key` (unique, random, not guessable), `colour`, `greeting`, `position` (`bottom_right` / `bottom_left`), `allowed_websites jsonb` (a list of origins like `https://nairstays.example`), `phone_number` and `whatsapp_number` (international form, empty = that button is hidden), `whatsapp_message` (ready-typed text), `button_order jsonb` (which of `chat`, `call`, `whatsapp` show, and in what order), `last_seen_website`, `last_seen_at`, actor stamps. RLS enabled and forced. The key lookup that finds the business from a public request goes in `kernel/database/across-accounts`-style code with a comment saying why (the one place a request has no business yet).
- `conversations`: no new column. A web visitor's phone and email use the existing `from_phone_key` and `from_email`; the visitor's session is a signed token (not stored). Whether a conversation has been asked to end is the existing `ended_at`.

## API

| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/channels/webchat` | manager, staff | Settings, the widget key, the code to paste, "last seen on". Hidden (404) while the module is off. |
| PATCH | `/channels/webchat` | manager | Colour, greeting, position, allowed websites, phone number, WhatsApp number and message, which buttons show and in what order. |
| GET | `/public/widget/{key}/config` | public | The bubble's settings and which buttons to show (with the `tel:` and `wa.me` links built from the numbers). Only for an allowed website; records "last seen". |
| POST | `/public/widget/{key}/messages` | public | A visitor's message. Starts a chat (answers a visitor token) or carries on one (needs the token). Answers the agent's reply. |
| GET | `/public/widget/{key}/messages` | public | The chat so far, for a visitor with a valid token (resume after a reload). |
| POST | `/public/widget/{key}/end` | public | The visitor closes the bubble: the chat ends and is sorted. |

Every public route is listed in `kernel/http/public-routes.ts` with its reason and is rate-limited. The loader script and the chat window page are served as plain files under `/widget/` (see Slices); the chat window page may be framed only by the business's own websites.

## Slices (each at most 2 routes, owner tests each one before the next)

1. **The module and its settings** (2 routes): migration 040, the module `channel.webchat`, `GET` and `PATCH /channels/webchat`, the widget key and the code to paste.
2. **A visitor chats** (2 routes): `GET /public/widget/{key}/config` and `POST /public/widget/{key}/messages`: allowed websites, visitor token, rate limits, the agent answers, the conversation and messages are saved, the visitor's phone or email is linked to the conversation.
3. **Resume, close, and the end of a chat** (2 routes + a job): `GET /public/widget/{key}/messages`, `POST /public/widget/{key}/end`, and the job that ends chats after 15 minutes of silence and queues the sorting and the summary.
4. **The widget** (static files, no new JSON route): the loader with the three buttons, the React chat window (a small new workspace `apps/site`, built and served by the API), framing rules, a test page (development only).
5. **Hand-off:** integration test of the whole story, the evals for chat-specific rules, the Feature guide, the manual script, the security checklist, the Postman collection.

## Screens

The **Channels → Website chat** screen is parked with the designer (code to copy, colour, greeting, position, allowed websites, preview, "Check installation"). Until then the Postman collection *Toobler One - F20 website chat (run in order)* and the widget test page tell whether it works.

## Rules to enforce

- **The business comes only from the widget key.** Never from the body, query, a header or a tool argument. An unknown key and a switched-off module both answer 404 (nothing is said about which).
- **Only the business's own websites** may use the public routes: the `Origin` of every call must be on the allowed list, else 403. An empty list means no website is allowed (safe by default). The answers carry CORS headers only for an allowed origin.
- **A visitor token** (signed, short-lived, tied to the business and the conversation) is needed to carry on or read a chat. A token for another business or another chat is refused. The visitor can never read or write another visitor's chat.
- **Limits:** per address and per widget key, a size limit on a message, a cap on messages per chat and chats per address per hour, and the existing AI budget of the business (F37) stops the cost: when the AI cannot answer the visitor is told plainly and nothing is lost.
- **The agent is the same agent** (F19): English only, no totals, one promise, nothing invented. The chat window says it is an AI assistant.
- **A visitor's words are data, never instructions.** Nothing a visitor writes reaches a log, an event or the activity log.
- **The page that frames the chat** is the only page allowed to be framed, and only by the business's allowed websites (`frame-ancestors`); every other page keeps `frame-ancestors 'none'`.
- **Module off:** the settings routes, the public routes, the job and the widget files answer 404 or skip; data is kept.
- **The chat's end is decided on the server,** never trusted from the browser.

## Tests

- **Unit:** the allowed-website check (exact origin, scheme and port; no wildcard by accident), the widget key and visitor token (made, checked, expired, tampered, another business), the "which chats are idle" rule, the phone linking, the code to paste.
- **API:** every route: works / 401 or the public equivalent / 403 wrong role or wrong website / 404 other business or unknown key or module off / 400 bad input; rate limits; token rules; the conversation and messages are saved; a chat that gives a phone number is linked; a chat that does not stays anonymous (R59: the router waits).
- **Job:** ends the right chats, only chats of the right age, only `webchat`, not test chats, only once; queues the sorting and the summary; safe to run twice.
- **Integration:** a visitor chats (enquiry then phone number), goes quiet, the job ends it, and a contact, a lead and a summary exist; a complaint chat makes a ticket and no lead.
- **Isolation:** key of business A never reaches business B's chats; a token of A is refused on B.
- **Widget (browser tests):** the bubble shows on an allowed page and not on another, the chat opens, a message gets a reply, a reload resumes it, phone and desktop sizes.

## Manual test script

You need: the API running (`npm run dev`), `npm run build:widget` run once, a **manager** login for a test business with an AI key (or the platform's), and Postman with the collection *Toobler One - F20 website chat (run in order)*.

1. **Settings.** Run folders 0 to 3 in Postman. Expect 200 everywhere, a key `wk_...`, and the buttons shown once the numbers are set.
2. **List the test page.** `PATCH /channels/webchat` with `{"allowedWebsites":["http://localhost:4000"]}` (the test page is its own website).
3. **Open the test page:** `http://localhost:4000/widget/test?key=YOUR_KEY`. Expect a blue (or your colour) bubble with Chat, Call and WhatsApp buttons in the corner. On a phone-sized window the chat covers the whole screen.
4. **Enquiry.** Tap Chat. The window says *AI assistant* and shows your greeting. Write: *"Hi, do you have a room next weekend?"*, then *"I'm Ravi, 98470 12345, please call me."* Expect the promise sentence in the reply.
5. **Reload** the page and open the chat again: the conversation is still there.
6. **End by closing.** Tap **End chat**. Within about half a minute, in Postman `GET /leads`: a lead for Ravi (phone +919847012345) with a summary on the conversation.
7. **Silence.** Start another chat, give a name and phone, and leave it for 16 minutes. Expect the same result without tapping anything (the job runs every minute).
8. **Complaint.** New chat: *"The air conditioning in room 12 is broken and nobody came."* with a phone number, then End chat. Expect a **ticket** and no lead.
9. **No phone number.** New chat: *"What are your opening hours?"*, End chat. Expect no lead and the conversation flagged for a person.
10. **A website that is not allowed.** In Postman run folder 6, request *a website that is not allowed*: expect 403. Open the test page from a website that is not listed (for example `http://127.0.0.1:4000/widget/test?key=...` while only `localhost` is listed): no bubble appears.
11. **Switch off.** In Settings, Modules, switch the website chat off: the bubble disappears and Postman's chat routes answer 404. Switch it on again: the same key works.
12. **Errors in plain words.** Stop the AI (remove the key) and send a message: the window says it cannot answer right now, with no technical words, and the message stays in the box.
13. **Keyboard and screen reader.** Tab through the bubble: every button has a name; Enter sends, Shift+Enter makes a new line, Escape closes the window.

## Security checklist

Reviewed with the `api-security` skill on 16 Nov 2026. Evidence is in the tests named in brackets.

**1. Keeping businesses apart**
- [x] The business comes only from the widget key (public routes) or the session (settings), never from the body, query or a tool argument (`webchat-widget`, isolation entries).
- [x] The one cross-business lookup (`findSettingsByWidgetKey`, and the list of businesses with idle chats) is named, commented, reads one row or ids only, and everything after it runs in the business's fence.
- [x] `webchat_settings` has `account_id`, RLS enabled and forced, and column grants (the key and the business can never change). The schema test passes.
- [x] An unknown key and a switched-off chat give the same 404; another business's token gives 401 and changes nothing (`webchat-widget`, `webchat-chat-end`, `webchat-journey`).

**2. Sessions and tokens**
- [x] No cookie is used by the public routes, so there is nothing to ride on; the CSRF check is replaced by the allowed-website check and the signed visitor token, and the reason is written in `public-routes.ts` and `csrf.ts`.
- [x] The visitor token is signed (HS256), expires (24 hours), names the business and the conversation, uses a key derived from the app secret (a sign-in token and a visitor token are never interchangeable), and is checked against the conversation (a test chat, another channel or another business is refused) (`visitor-token.test`, `webchat-widget`).

**3. Roles**
- [x] `GET` settings: any signed-in role except own-leads-only through the module guard; `PATCH`: managers only (`webchat-settings`).

**4. Agent tools**
- [x] Tool identity comes from the server (F19). The visitor's words are data: they are never logged and never reach an event or the activity log (`webchat-widget`: log test).

**5. Public routes**
- [x] Every public route is listed in `public-routes.ts` with its reason, and is rate limited (per address by the plugin; per key and per new chat in memory) (`webchat-widget`, strict-limit tests).
- [x] Allowed websites are checked on every call (exact scheme, host and port; no wildcard; empty list allows none); CORS headers are given only to an allowed website; the permission check reveals nothing for a refused one.
- [x] Size limits: 1,000 characters a message, 100 messages a chat, the body limit of the server.
- [x] The chat page can be framed only by the allowed websites (`frame-ancestors`), is shown only in a frame, answers 404 otherwise; every other page keeps "never framed" (`webchat-widget-files`).
- [x] The chat window's own calls are accepted through the browser's `Sec-Fetch-Site: same-origin` mark, only while a website is listed.
- [ ] A public route can still be called by a program that fakes the website header: the allowed-website check protects against other websites in a browser, not against a script. The limits and the AI budget (F37) are what stop abuse. Accepted: documented here.

**6. Input, files, secrets, logs**
- [x] Every body, query and parameter is checked by zod with maximum lengths; Kysely parameters only.
- [x] The files served are read by plain file name from one folder (no path can leave it; `.env`, `..`, encoded paths and unknown types answer 404) (`webchat-widget-files`).
- [x] The test page exists only outside production and puts only a key of the right shape into the page (no script injection).
- [x] The loader accepts only `tel:` and `https://wa.me/` links and a `#RRGGBB` colour, whatever the server sends; the chat window sets text with React (no raw HTML) and its page policy allows no inline code.
- [x] No secret is added; logs hold ids only.

**7. Tests**
- [x] Every route: works, 400, 401 or 403, 404 (`webchat-settings`, `webchat-widget`, `webchat-chat-end`, `webchat-widget-files`), isolation entries, the journey (`webchat-journey`), browser tests at phone and desktop size including an accessibility check (`e2e/website-chat.spec.ts`).

**8. Dependencies**
- [x] No new package (React, Vite and the plugin are the versions the staff app already uses). `npm audit` is part of `npm run audit:deps`.

## Decisions and differences from the requirements

Owner decisions on 16 Nov 2026 (recorded as R63 in REQUIREMENTS-REVIEW.md):

1. **Backend first, widget after** (slices 1 to 3 are Postman-tested before the widget is built).
2. **Plain replies first, streaming later** as its own slice.
3. **The widget is served from the API's own address for now** (hosting R14 stays open); only the address changes when a host is chosen.
4. **A chat ends after 15 minutes of silence** (or when the visitor closes the bubble).

Also decided by the owner (16 Nov 2026): the chat window is **React in an iframe, as the plan says** (the loader on the customer's page stays plain JavaScript); the **Call and WhatsApp buttons** are built as simple links and kept for later use.

To confirm with the owner (my choices, written so they can be changed):

- **Two public routes beyond the API list:** `GET .../messages` (so a reload does not lose the chat) and `POST .../end` (so closing the bubble ends the chat at once). The requirements list only config and messages.
- **Settings live in a table of their own** (`webchat_settings`), not `accounts.widget` or `account_modules.settings`, because the public routes must find a business by its key.
- **An empty list of allowed websites means the chat works nowhere**, so a new business is safe until it adds its site.

Differences from the requirements: the **Call** button is a plain `tel:` link now ("connects to the voice agent" in the browser arrives with voice, F29, as the plan already says). The "WordPress plugin" is later.

## Slice 2 build notes (16 Nov 2026)

- **Built:** `GET /public/widget/{key}/config`, `POST /public/widget/{key}/messages`, plus the browser's permission check (`OPTIONS`) on both paths (they have no logic; they are listed in `public-routes.ts`). Migration 041 (a web chat learns the visitor's phone or email during the chat: column grant plus a database trigger so a known phone or email can never be changed or cleared).
- **How a message flows:** key finds the business (the one cross-business lookup, `findSettingsByWidgetKey`) → module on? → website on the allowed list? → token checked (signed with a key derived from the app secret, so it can never be used as a sign-in token) → limits → the agent answers through the new shared `createAgentSavedTurnService` (also used by Test the agent, so a message is handled the same everywhere) → the conversation and both messages are saved → the phone or email the agent saved is linked to the conversation → a fresh token comes back.
- **Choices to confirm:**
  1. The public routes skip our CSRF check (it is for our own web app's cookies); the allowed-website check and the token replace it. No cookie is ever used.
  2. When the AI cannot answer, the visitor gets `503 ASSISTANT_UNAVAILABLE` in plain words and nothing is saved, so the message can be sent again. (A visitor message is lost if the AI stays down; staff are not told. Known limit.)
  3. A chat of 100 messages is refused (`CHAT_TOO_LONG`); 1,000 characters per message; 10 new chats per address per hour; 120 messages per key per minute; 20 per address per minute. The per-key and new-chat limits are kept in the server's memory (fine for one server; revisit if the API runs on several).
  4. A token for an ended chat starts a new chat (answer says `newChat: true`).
- **Open for slice 4:** the chat window runs on the API's own address, so its calls are same-origin and carry the API's own address as `Origin`, not the customer's website. Slice 4 must decide how those calls prove which website framed them (the framing rule `frame-ancestors` already limits who can show the window). Also the API sends `Cross-Origin-Resource-Policy: same-origin` (helmet default), which must be relaxed for `/widget/loader.js`.


## Slice 3 build notes (16 Nov 2026)

- **Built:** `GET /public/widget/{key}/messages` (the chat so far, for a reload), `POST /public/widget/{key}/end` (the visitor closes the bubble), their browser permission check, and two jobs: `webchat.find_idle_chats` (every minute, no business: finds businesses that have chats quiet for 15 minutes) and `webchat.end_idle_chats` (one business: ends its idle chats). No migration.
- **Ending a chat** (by the visitor or by silence) is one step, `handOverChat`: queue `conversations.sort_conversation` and `agents.summarise_conversation`, then note `ended_at`. The jobs are queued first, so a failure leaves the chat open to try again; closing an ended chat queues nothing, and the sort and summary are safe to run twice.
- **Idle means:** a real (not test) web chat, not ended, not sorted, whose last message (or start, when nothing was said) is more than 15 minutes old. Up to 50 per business per minute. While a business has the chat switched off its idle chats are left alone (the job runner skips the job) and are ended when it is back on.
- **New plumbing:** `app.kernel.enqueueJob`, so a route can queue a job (server.ts sets it when the job runner starts; tests pass a recording one). This also gives the "nothing queues the summary yet" known limit of F19 its answer for web chat.
- **Known limit:** a visitor who closes the browser without the bubble's Close is ended by the 15-minute rule only.

## Slice 4 build notes (16 Nov 2026): the widget

- **New workspace `apps/site`** (React 19 and Vite, the same versions as `apps/web`; no new packages): `chat.html` and `src/chat/*` (the chat window), `public/loader.js` (the plain-JavaScript loader, about 150 lines, no libraries). `npm run build:widget` builds it into `apps/site/dist/`; `npm run build` builds both apps. The chat window is about 70 kB gzipped (React; it deliberately does not import the shared package's validation library). `dist/` is not committed: deploy runs the build, or `WIDGET_FILES_DIRECTORY` points to it.
- **The API serves the files** (no new package, no folder listing): `GET /widget/loader.js`, `/widget/assets/{file}` (plain file names only, from one folder), `/widget/chat?key=` and, in development only, `/widget/test?key=`. They are not under `/api/v1`, so modules got a new `pages` hook next to `routes`.
- **The loader** asks `/config` (cross-origin, so it only works on allowed websites), then draws the launcher in a shadow root (the page's own CSS cannot touch it): Chat, Call (`tel:` link), WhatsApp (`wa.me` link, new tab, `noopener`), in the business's order, colour and corner. The chat window page is loaded only when Chat is first tapped. On a phone (480 px or less) the window is full screen. Only `tel:` and `https://wa.me/` links are accepted, whatever the server says.
- **Framing rule (the open point from slice 2, decided):** the chat page answers 404 unless the key is known, the chat is on, the business has listed a website, and the browser says it is opening the page in a frame. It sends `frame-ancestors <the allowed websites>` (and removes `X-Frame-Options` for this one page), so only those websites can show it. Every other page keeps "never framed" (tested). Calls from the window are on the API's own address, so the browser marks them `Sec-Fetch-Site: same-origin` (a web page cannot fake it); the public routes accept them while the business has listed at least one website. They do not count as "last seen".
- **Chat window behaviour:** greeting, an "AI assistant" label, messages, Enter sends (Shift+Enter makes a line), 1,000-character limit with a counter near the end, plain-words errors (no codes), the message is given back on a failure, a reload carries on the chat (the token is kept in the browser, memory only where storage is blocked), **End chat** ends it and starts clean, **×** and Escape close the window (they do not end the chat; it ends after 15 minutes of silence). Text and colours: neutral greys plus the business's colour; the staff app's design system is not used here because this is the customer's website (to confirm with the designer).
- **Test page:** with the API running, `http://localhost:4000/widget/test?key=YOUR_KEY` shows a page with the pasted line. For it to work, add `http://localhost:4000` to the allowed websites (the page is its own website).
- **Browser tests:** `e2e/website-chat.spec.ts` (11 tests, phone and desktop) runs the real loader and window against a pretend chat service and two pretend websites (`e2e/widget-fixture/server.ts`); the real service's rules are in the API tests.
- **Known limits:** websites with a strict Content-Security-Policy need to allow the chat service address (the setup page with these entries is parked with the Channels screen); the window is not translated (English only by rule); no file or voice messages; no typing indicator from staff (F21).
