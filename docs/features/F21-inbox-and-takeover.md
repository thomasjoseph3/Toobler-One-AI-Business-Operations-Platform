# F21: Inbox, staff takeover and live updates

**Requirements:** `4-staff-workspace/02-inbox.md`, `3-ai-agents-and-channels/07-staff-takeover.md`, `requirements/API.md` (Inbox, Staff takeover, `/events`); docs/plan/PHASE-1.md (F21); docs/CONVERSATION-TYPES.md.
**Depends on:** F15 conversations, F19 agent, F20 website chat, F10 filtered tab.      **Modules:** `core.conversations` (inbox, takeover, reply, done) and a new small core module `core.live` (the `/events` stream; F22 Today adds its own event names to the same allowlist). The web chat widget (`channel.webchat`) learns to show staff replies.
**Status:** `in_review`, built as ONE unit (owner decision 18 Nov 2026).

## Feature guide

**What it does.** The **Inbox** is one list of every conversation your business has had with a customer, from every channel (website chat today; WhatsApp, email and phone calls as they are connected). Conversations that need a person come first, then the newest. For each one you see who it is with, what the customer first said (or the AI's summary), what kind of conversation the AI thinks it is, and who, if anyone, is handling it. Open one to read it all. If the customer needs a person, press **I'll handle this**: the AI stops answering in that conversation at once, and you type the replies from the Inbox. When you are done, press **Hand back to AI** and the AI carries on, or just leave it: after two hours without a reply from you, it goes back to the AI by itself. **Mark as done** takes a finished conversation off the open list. The Inbox and the open conversation also **refresh by themselves** when something happens (a new message, someone taking over), so you never have to reload.

**Why it is useful.** Staff used to check four places. One inbox means nothing is missed, and when a customer is upset or the question is big, a person can step in within a second, already knowing everything the AI collected.

**A day in the life.** A visitor on Nair Stays' website asks the AI about a hall for 200 guests, and then writes "I want to speak to someone". The conversation jumps to the top of Rahul's Inbox, marked *Needs a person*. He opens it, reads what the AI already learned, and presses *I'll handle this*. The visitor's chat window says "A member of our team has joined this chat", and the AI goes quiet. Rahul replies "Yes, up to 250. Which dates?" and the visitor sees it in a few seconds. Afterwards he presses *Hand back to AI* (or forgets, and two hours later the AI takes over again), then *Mark as done*.

**Who can do what.** Managers and staff can read the Inbox, take over, reply and mark done. Only one person can handle a conversation at a time; anyone else sees who has it and cannot take it over. Only the person handling it can reply. They, or a manager (for example when the person is on leave), can hand it back. The "own leads only" role cannot use the Inbox yet.

**Settings and limits.** Two hours is how long a takeover lasts after the last reply (not a setting yet). A reply can be up to 2,000 characters. The list shows 25 at a time. Test chats from "Test the agent" and conversations the rules filtered out (spam, wrong numbers) are not in the Inbox (the Filtered tab has the second kind). If the customer writes again in a conversation marked done, it comes back to the open list.

**What it never does.** The AI never answers while a person is handling the conversation, even if the person pressed the button a moment after the AI started thinking: its answer is thrown away. It never sends words to the live screens: they only hear "something changed in this conversation" and then ask for what they show. A person cannot reply to a conversation that has ended.

**Not part of it.** Replying on WhatsApp, email and phone (each is added when that channel is connected, using the same Reply button); the AI's email draft that staff edit and send (with email); the "Answered from" links showing which FAQ or document the AI used (a small follow-up: the AI does not save that yet); showing the team member's name to the customer as a setting.

### For the tech team

Modules: `core.conversations` (inbox list, takeover, handback, reply, done; the release job) and the new `core.live` (`GET /events`). Migrations 069 (`conversations.held_by_user_id`, `held_until`, `done_at`, an index on `domain_events (account_id, occurred_at)`) and 070 (`conversation_messages.by_user_id`). Routes (staff, not `staff_own`): `GET /conversations` (the inbox; `filtered=true` is still the Filtered tab), `POST /conversations/{id}/takeover | handback | reply | done`, `GET /events`; the widget's `GET/POST /public/widget/{key}/messages` gained `heldByPerson`, a nullable `reply` and `staff` messages (the GET has its own, higher rate limit `widgetPoll`: 600 a minute per address). Jobs: `conversations.release_expired_holds` (every 5 minutes, one `..._for_business` each). Events (ids only): `conversation.started | message | ended | held | released | done`. Log lines: `conversations.taken_over | handed_back | marked_done`. How it works: a hold is `held_by_user_id` + `held_until`; an expired hold counts as released at once (`isHeldNow`). Takeover, handback, reply, done and the AI's save all take the conversation's row lock (`lockConversationById`); `saveCustomerMessageAndAgentReply` re-checks the hold under that lock, so a takeover during the AI's thinking wins. The shared saved-turn service (`answerAndSave`) asks the AI nothing when the conversation is held, and gives the AI staff messages marked `[A team member of the business replied]`. Ending a conversation clears its hold. The live stream reads the business's own new `domain_events` rows every 2 s inside the account fence (so it works with several API processes), with a 10 s overlap and an id memory, from the moment it opens, and forwards only an allowlist of names with ids. The web app keeps one `EventSource` per open Inbox page and refetches on each update (and after a reconnect). Known limits: replies work only on web chat; a stream does one small query every 2 s per open screen (fine for a small team; revisit with `LISTEN/NOTIFY` if many screens are open); the hold length is a constant.


## Reused from the hotel agent

Read (18 Nov 2026): the old `core/inbox` is an **email-only** inbox (Gmail mailbox reading, AI drafts, dismiss) and `core/conversations` is 84 lines; neither has takeover, a hold, replies on a channel or live updates. **Nothing to reuse**; the email draft ideas wait for F26.

## Scope

**In:** the Inbox (all real conversations, filters, needs-a-person first, type chips, "AI unsure"); a conversation view; **I'll handle this** / **Hand back to AI** (one holder, 2-hour auto-return); staff **reply** (web chat is the only channel that exists; the other channels add their sender with their own feature); **Done**; the **live updates** stream `GET /events`; the web chat widget shows staff replies and says a person has joined. "Change type" reuses the F15 route.
**Out (later features, said plainly):** replying on WhatsApp, email and phone (F25, F26, F29 each add their sender to the same reply route); the AI's email draft and `POST /conversations/{id}/draft/send` (F26); the **"Answered from" links** (**owner decided 18 Nov 2026: deferred**; the agent does not store which FAQ or document answered a message yet, so it needs a change to the agent's saved turn, a small follow-up after F21); a staff member's name on replies in the widget as a setting (the widget shows "Team member").

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md as R80)

1. **Held means:** `held_by_user_id` is set and `held_until` is in the future. An expired hold counts as not held at once (no waiting for a job); a job every 5 minutes clears expired holds and publishes `conversation.released`.
2. **One holder:** taking over a conversation someone else holds answers 409 `HELD_BY_SOMEONE_ELSE` naming them; taking over your own is fine (it extends the time). Only the holder can reply or hand back (409 `NOT_THE_HOLDER`, "Take over first"). A **manager can hand back** a conversation held by someone else (the person is on leave).
3. **2 hours:** every staff reply moves `held_until` to now + 2 hours. No staff reply for 2 hours returns the chat to the AI. The hold length is a constant in code, not a setting (Phase 1).
4. **The AI never replies while held:** the shared saved-turn service (every channel and the widget go through it) checks the hold before asking the AI and again just before saving; if the conversation is held the customer's message is saved and no AI reply is made or saved. The widget is told "a person is on this chat".
5. **Reply:** saves a `staff` message (the person is stamped) and sends it on the customer's channel. Web chat: the widget shows it (it asks for new messages every 4 seconds while open). Other channels answer 409 `CHANNEL_CANNOT_REPLY_YET` (they do not exist yet). A reply to an ended chat is 409 `CONVERSATION_ENDED`.
6. **Done:** any open conversation can be marked done (`done_at`): a note to the team that nobody needs to act. A new customer message on a done conversation reopens it (`done_at` is cleared). Marking done also releases any hold.
7. **The inbox list** is `GET /conversations` without `filtered=true` (the Filtered tab keeps `filtered=true`). Filters: `channel`, `status=open|done`, `held=me|any`, `needs_person=true`. Sorted: needs a person first, then newest activity (last message) first. Test chats and conversations sorted as filtered/ignored types are left out (they have their own tab). Paged 25.
8. **Who sees what:** managers and staff; the "own leads only" role answers 403 (R60, unchanged).
9. **Live updates:** `GET /events` is a server-sent-events stream for the signed-in person's business, in its own module `core.live`. **Each open stream reads its own business's new rows of the event outbox (`domain_events`) every 2 seconds** (inside the business's database fence), so it works with any number of API processes and wherever the dispatcher runs. Only an allowlist of event names is forwarded (conversation events now), as `{ "event": "conversation.message", "conversationId": "…" }`: kind and id only, never words. The stream starts at the moment it opens (no history), overlaps its reads by 10 seconds and remembers recent ids, so an event committed late is not missed and none is sent twice. Screens refetch what they show. The "own leads only" role gets an open stream with no conversation events. Needs migration 069's index on `(account_id, occurred_at)`.
10. **Events published** (new): `conversation.started`, `conversation.message`, `conversation.ended`, `conversation.held`, `conversation.released`, `conversation.done` (ids only).
11. **"The AI never replies while held" is enforced under a lock:** takeover, hand-back, reply and the AI's save all take the conversation's row lock (`lockConversationById`). The agent's reply is saved in the same transaction that re-checks the hold, so a takeover that lands while the AI is thinking wins and the AI's answer is thrown away (the customer's message is still saved).
12. **After a hand-back the AI sees what the person said:** staff messages are included in the history the agent is given, marked as said by a team member, so it does not contradict a promise.
13. **A held chat that goes quiet:** the 15-minute idle rule still ends a web chat the visitor has left; ending a conversation releases its hold (`conversation.released`). A person cannot reply to an ended chat.
14. **The widget:** `reply` becomes nullable and a `heldByPerson` flag is added; the chat messages gain the sender `staff`; it asks for new messages every 4 seconds while open, through a read route that is NOT counted by the 120-messages-a-minute limit.

## Migration `069_conversations_takeover.sql`

`conversations.held_by_user_id` (composite key to a person of the same business), `held_until`, `done_at`; check that both hold columns are set or both empty; index for the inbox sort; grants to update them.

## Endpoints (`/api/v1`)

| Method | Address | Who |
| --- | --- | --- |
| GET | `/conversations?channel=&status=&held=&needs_person=&page=&limit=` | staff (not `staff_own`) |
| POST | `/conversations/{id}/takeover` | staff |
| POST | `/conversations/{id}/handback` | staff (holder, or a manager) |
| POST | `/conversations/{id}/reply` `{ body }` | staff (the holder) |
| POST | `/conversations/{id}/done` | staff |
| GET | `/events` (stream) | staff |
| GET | `/conversations/{id}` (exists; gains `heldBy`, `heldUntil`, `doneAt`, staff names on messages) | staff |
| GET `/public/widget/{key}/messages` (exists; gains staff messages and a `heldByPerson` flag), POST same (a held chat answers `{ reply: null, heldByPerson: true }`) | public |

Every route: works / 401 / 403 / 404 / 400 (+409 cases) tests, isolation entries.

## Screens (phone first)

Inbox: filter chips (channel, open/done, held by me, needs a person), rows with channel icon + word, contact (or "Unknown visitor"), the summary or first words, type chip, "AI unsure" tag, a "needs a person" mark, "held by <name>"; empty, loading, error. Opening a row: the conversation (messages, who said each, time), buttons **I'll handle this** / **Hand back to AI**, a reply box (only for the holder), **Done**, **Change type**, a link to the contact and lead. Live: the list and the open conversation refresh when an event arrives.

## Manual test script

1. Sign in as the manager of a test business with the website chat switched on and the business live (Setup → Go live). Open the chat bubble on the test page (or the chat window address) and ask "Do you have a hall for 200 guests?". Expected: the AI answers, and **Inbox** shows the conversation (web chat, with your question as the preview).
2. In the chat window type "I want to speak to someone" (the conversation is marked *Needs a person* once the AI sorts it; to see that now, end the chat). Open the conversation from the Inbox. Expected: messages with who said each.
3. Press **I'll handle this**. Expected: the page says you are handling it and a reply box appears. In the chat window, send "Hello?". Expected: **no AI answer**; the window says "A member of our team has joined this chat."
4. Type a reply in the Inbox and press **Send reply**. Expected: it appears in the conversation, and within about 4 seconds in the visitor's chat window.
5. Open the same conversation as a second person (another browser, signed in as staff). Expected: "<your name> is handling this conversation"; no take over button, no reply box. As that person's manager, **Hand back to AI** is available.
6. **Hand back to AI** (confirm). Expected: the AI is answering again; send a message from the chat window and the AI replies, knowing what your team member said.
7. **Live updates:** keep the Inbox open in one browser, send a message from the chat window. Expected: the Inbox updates without reloading (within a couple of seconds). Open two browsers and take over in one: the other shows it.
8. **Mark as done** (confirm): it leaves the *Open* list and shows under *Done*. Send another message from the chat window: it returns to *Open*.
9. Filters: channel, *Needs a person*, *Held by me*, *Done*.
10. Phone: repeat at 375 px wide; no sideways scrolling, buttons reachable.

## Security checklist

- [x] Every route has a role (`staff`) and works / 401 / 403 / 404 / 400 / 409 tests (`apps/api/test/inbox-takeover.test.ts`, `webchat-widget.test.ts`, `live-updates.test.ts`); isolation entries for the four POST routes and the inbox list; `GET /events` is exempt with a reason and tested with two real streams (one business never hears the other's).
- [x] The business comes from the session, never from input; the stream reads inside the account fence.
- [x] No words or personal data in events, the stream or the activity log (ids and kinds only).
- [x] The "own leads only" role gets 403 on the routes and an empty stream.
- [x] The AI never replies while held: checked before the AI is asked and again under the row lock before saving; tested with a takeover that lands while the AI is thinking.
- [x] Hand back and done ask "Are you sure?" naming the conversation.
- [x] The public widget read route is rate limited (its own limit) and still needs the visitor token; a visitor sees only their own chat's messages.

## Differences from the requirements and the plan

"Answered from" links are deferred (owner, 18 Nov 2026). Replies work on web chat only (the other channels do not exist yet). `POST /conversations/{id}/draft/send` waits for email (F26). The stream reads the event outbox itself rather than receiving events from the dispatcher (works with several API processes).

## Build log

Migrations 069, 070; the inbox list, takeover, handback, reply, done, the release job (core.conversations); `core.live` (`GET /events`); the widget shows staff replies and polls; the Inbox and Conversation screens with live refresh; tests: pure helpers (live events 3, inbox state 4), API 15 (`inbox-takeover`), 3 (`live-updates`, real streams), 1 widget journey, isolation entries; 16 browser tests.
