# F20: Website chat (the first channel)

**Requirements:** `3-ai-agents-and-channels/05-website-chat.md`; docs/plan/PHASE-1.md (F20); docs/ARCHITECTURE.md §2 (the conversation engine and `ChannelAdapter`); docs/SECURITY.md (public routes and the widget); `requirements/API.md` (Website chat)
**Depends on:** F03, F15, F19, F37      **Module:** `channel.webchat` (a channel module: switched on per business, plug and play)
**Status:** `in_progress` (brief written 16 Nov 2026; owner decisions below)

## Feature guide

*(Written before hand-off, as F18's and F19's are. Plain English first, then "For the tech team".)*

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

*(To be written in slice 5.)* Planned: paste the code on the test page, chat as a customer (an enquiry, then a complaint), see the lead, the ticket and the summaries appear; try from a website that is not allowed and see it refused.

## Security checklist

*(Copied from docs/SECURITY.md and ticked at hand-off, using the `api-security` skill.)*

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
