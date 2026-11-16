# F15: Conversation types and the router

**Requirements:** [docs/CONVERSATION-TYPES.md](../CONVERSATION-TYPES.md) (the design; replaces three lists in scoring, email and tickets, see R1 and R21); `requirements/phase-1-lead-engine/2-crm-core/07-lead-scoring-and-filtering.md`, `3-ai-agents-and-channels/06-email.md`, `4-staff-workspace/06-tickets.md`; docs/plan/PHASE-1.md (F15)
**Depends on:** F00, F01, F03, F04, F06, F14, F37 (the AI service)      **Module:** `core.conversations` (core: always on; requires `core.auth`, `core.contacts`, `core.leads`, `core.tickets`, `core.ai`)
**Status:** `in_review` (built 16 Nov 2026 in slices 1 to 7c; the owner tested slices 1 to 4 as they were built; slices 5 to 7c wait for the owner's check). The screens wait for the designer.

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
People contact a business for many reasons, and only some of them want to buy. This feature decides **what each conversation was about** and **what should happen because of it**, the same way for every way a person can get in touch (website chat, WhatsApp, email, phone).

Every business has a list of **conversation types**: new enquiry, general question, existing customer, complaint, callback request, supplier, job seeker, spam, wrong number, and a few more, plus extras for its industry (a hotel gets "In-house guest request", a clinic gets "Emergency"). Each type says what happens next: it becomes a **lead**, a **ticket** for someone to handle, it is only **noted**, it goes to the **Filtered** tab, it is **ignored**, or **a person looks at it**.

When a conversation ends, the system sorts it:
1. **Rules first, no AI.** Silent calls, empty chats, machine-made emails, blocked numbers and the business's own team are recognised straight away.
2. **Then the AI reads the whole conversation** and names its type, how sure it is, and whether a person should step in. It can only choose from the business's own list.
3. **Then fixed rules decide what to do.** The AI never decides what happens next, so the same kind of conversation always gets the same result, and the business controls that result.
4. **The contact, lead or ticket is made** (or the person's open one is used). A person can correct the type afterwards, and everything follows.

### Why it is useful
- The sales board stays trustworthy: complaints, job seekers, suppliers and spam do not become leads.
- A complaint becomes a high-priority ticket for the manager instead of being lost among enquiries.
- A conversation that is both a complaint and a price request gives both a ticket and a lead.
- Each business decides what happens to each kind of conversation, in its own words, without a developer.
- A known spammer can be blocked once and never reaches the AI, so it costs nothing.
- Staff can correct the AI with one step, and the lead or ticket follows the correction.

### How it works: a day in the life
1. A hotel signs up. The first time its manager opens the list, the hotel gets 13 built-in types and three hotel extras.
2. The manager sees that "General question" fills the board with cold leads, so they change what happens to it to "only note it". They add their own type, "Wedding enquiry", that becomes a lead and tells the owner.
3. A number keeps calling to sell insurance. The manager adds it to the block list with a reason.
4. At 9 pm a guest writes on WhatsApp: "The AC in room 204 did not work all night. Also, what would March cost?" When the chat ends, the AI says: complaint (sure) and new enquiry (fairly sure). The system makes the guest a contact (from the WhatsApp number), opens a **high-priority complaint ticket** for the manager, and makes a **lead** for the March price.
5. The next day the same guest writes again about the AC. The new conversation is added to the **same ticket as a note**, not a second ticket.
6. A week later a message arrives that the AI sorted as an enquiry but was only fairly sure about. In the inbox it shows "AI unsure". A staff member sees it is really a supplier, changes its type, and the lead it made is taken off the board (kept in the history as "Reclassified (not a sale)").
7. A person who tried the chat but gave no phone and no email cannot become a lead: the conversation is marked "needs a person" so staff can follow up.

### Who can do what
| | Manager | Staff | Own-leads-only staff |
| --- | --- | --- | --- |
| See the list of types | Yes | Yes | Yes |
| Add, change, switch off, remove or reorder types | Yes | No | No |
| Test a message with "Try it" (uses the AI) | Yes | No | No |
| See and change the block list | Yes | No | No |
| Read a conversation and change its type | Yes | Yes | No (until the inbox decides who sees which conversation) |

(The full picture of roles is in `docs/ROLES-AND-ACCESS.md`.)

### Settings and limits
| What | Value |
| --- | --- |
| Built-in types | 13 for every business, plus extras for hotel, clinic, car dealer, school, travel agent and real estate. They can be renamed and re-routed, but never switched off or removed. |
| Your own types | Up to 25 types switched on at once (the AI reads all of them each time, so more would make it slower and less accurate). Types switched off do not count. |
| A type's words | Name up to 80 characters, description up to 500, up to 5 examples of up to 300 each |
| What can happen | Make a lead, make a ticket (with its kind and priority), only note it, send to Filtered, ignore, or ask a person to look |
| How sure the AI must be | 70% or more: applied. 40% to 70%: applied and marked "AI unsure". Below 40%: "unclear", a person looks, and no lead or ticket is made |
| Block list | Up to 500 numbers or emails, each with an optional reason of up to 200 characters |
| "Try it" | Up to 10 a minute; each try is one real AI call; nothing is saved |
| Re-enquiry rule | A lead lost less than 60 days ago is reopened; an open lead takes the new enquiry; otherwise a new lead is made |

### What it never does
- Show or change another business's types, block list or conversations.
- Remove or switch off a built-in type.
- Let the AI decide what happens next, or invent a type the business does not have.
- Follow instructions hidden in what a customer wrote.
- Write what a customer said into the activity log, an event, a ticket or the AI usage record.
- Make a contact for spam, wrong numbers, silent calls or machine email.
- Delete a lead or ticket when a person corrects a type: it is kept and taken off the board or closed with a note.
- Make up a contact: a conversation with no phone and no email waits for a person.

### What is not part of it
Sending the alerts (F23), the inbox and staff takeover (F21), the AI agent that talks to customers (F19), the channels that bring conversations in (F20 onward), the timeline (F07), the accuracy report (F28), the screens (waiting for the designer), and the live type during a call (after Phase 1, R58). Until a channel exists, conversations are made by the test script `npm run conversation:simulate`.

### For the tech team
- **Module:** `core.conversations` (core, always on; requires auth, contacts, leads, tickets and AI). Public entry points (`index.ts`): `createConversationRecordsService`, `createConversationFinaliser`, `createConversationClassifier`; job `conversations.sort_conversation`; event `conversation.sorted` (and `conversation.type_corrected`).
- **Tables (migrations 031 to 037):** `conversation_types`, `block_list`, `conversations`, `conversation_messages`, `conversation_outcomes`, `classification_corrections`. All have row-level security (forced). Database rules back the code: at most 25 active types, system types cannot be deleted, a ticket type needs a ticket kind and priority, a block list entry is a number or an email never both, a sorted conversation has a type and a time, messages and corrections are written once.
- **Routes (10):** `GET, POST /conversation-types`, `POST /conversation-types/test`, `POST /conversation-types/reorder`, `PATCH, DELETE /conversation-types/{id}`, `GET, PUT /block-list`, `GET /conversations/{id}`, `POST /conversations/{id}/type`. Who may call each: `docs/ROLES-AND-ACCESS.md`.
- **How a conversation is sorted:** read (one transaction) → rules or the AI (no transaction open) → save type and outcomes (one transaction, row lock) → carry out the outcomes (another transaction: contact, then lead or ticket through the leads and tickets modules). Safe to run twice and to retry; a retry does not ask the AI again.
- **The AI:** the job `classify_conversation` through the F37 service (model order and keys per business; defaults Gemini Flash-Lite then GPT-4o mini); the answer must fit a shape built from the business's own type keys; tokens and cost are recorded per call with no text.
- **Measure it:** `npm run eval:types` (58 labelled English hotel examples, targets 90% / 95% / 5%). Try it by hand: `npm run conversation:simulate`.
- **Known limits:** presets for a new industry reach only businesses that have not read their list yet (see the design note in `CONVERSATION-TYPES.md`); two sortings of one conversation at the same moment both ask the AI (only one is saved); messages in one conversation have no explicit order beyond their time (fine one at a time; add an order when a channel adds several at once); message retention is decided with the inbox (F21); no `route` column until teams exist (F02); the AI sees customers' words (sent to the company whose key is used), so the privacy notice and the processing agreement are part of F24; see R57 (database review), R58 (live type later), R59 (carrying out), R60 (who can read conversations).

## Decisions made at the start (owner, 16 Nov 2026)

1. **Messages are stored now.** F15 creates the `conversations` and `messages` tables, because the router, the agent (F19) and every channel need the history. (R56)
2. **Any model can be used; the defaults are a small, cheap one.** F15 asks F37 for the job `classify_conversation`. F37 already orders it: **Gemini Flash-Lite (latest) first, GPT-4o mini second**, then the other small models. A business can change the order in its own AI settings. F15 never names a model.
3. **No special "feed" for the router.** The channels (F20 website chat first, then WhatsApp, email and calls) are what feed it. Until then it is tested with unit tests, API tests that create conversations directly, a labelled example set (the classification eval) and the **`POST /conversation-types/test`** route ("Try it": classify a pasted message, save nothing).
4. **F15 builds the engine's "decide what this was" part only.** It does not create conversations from any provider (the channels do), and it does not run the agent (F19).

## Scope
- **In:** the tables `conversation_types`, `conversations`, `messages`, `conversation_outcomes`, `classification_corrections`, `block_list`; the 13 system types (and the industry presets) given to every business, new and existing; types API (list, add, edit, delete a custom one, reorder); block list; the pre-filter (pure code); `router.decide` (pure code); the classifier (one structured AI call, schema built from the business's own type keys); a "Try it" route; the **finalise** service (final type, router, outcomes applied: lead, ticket, log, filter, ignore, review); staff correction (`POST /conversations/{id}/type`) that re-runs the router and moves lead ↔ ticket; the classification eval set v1 (English).
- **Out (later):** the agent and its playbooks (F19; the live `set_conversation_type` tool is after Phase 1, R58: the first release sorts only after a conversation ends); every channel (F20, F25, F26, F29); the inbox screens and staff takeover (F21); staff alerts (F23: F15 records who should be alerted, F23 sends); scoring (F10); reports; Malayalam and Hindi eval sets (voice, F29); the **screens** (Settings → Conversation types with the Try it box, block list, Change type menus, the Filtered tab): waiting for the designer.

## Reused from the hotel agent
- **Read:** `src/agent/{index.js,industry.js}`, `src/agent/shared/{conversation.js,prompt.js,schema.js}`, `src/modules/core/{conversations,inbox}`, `test/unit/{prompts,agentTools,agentInputs}.test.js`, `scripts/agent-eval.js`.
- **Reused:** the idea of building a prompt from the business's own facts plus a stable part (kept for F19), and the shape of the eval script (labelled examples, a score at the end).
- **Changed:** the old project had no classifier and no router: every conversation was handled inside each channel. Here one shared engine decides the type for every channel. Types, outcomes and the router are new work, written to docs/CONVERSATION-TYPES.md.
- **Left behind:** hotel-only prompt text and the per-channel conversation handling (it moves into the engine).

## Database (forward-only, one migration per change: `031_conversation_types.sql`, `032_conversation_types_active_limit.sql`, `033_conversation_types_delete.sql` and `034_block_list.sql` and `035_conversations.sql` so far; the others with the slice that needs them)
Every table has `account_id`, RLS enabled and forced, `created_by` / actor where a person or the system changes it.
- `conversation_types`: `key`, `label`, `description`, `examples` jsonb (up to 5), `system` bool, `outcome` (`lead` / `ticket` / `log` / `filter` / `ignore` / `review`), `ticket_type`, `priority`, `route` jsonb, `needs_person`, `alert` jsonb, `playbook`, `active`, `sort`. Unique per (business, key). Up to 25 active per business.
- `conversations`: one row per conversation on any channel (`channel`, `contact_id`, `type_key`, `type_confidence`, `type_source` = `rule` / `ai_live` / `ai_final` / `staff`, `ai_unsure`, `needs_person`, `status`, `held_by_user_id`, `held_until`, `summary`, `ended_at`, `done_at`).
- `messages`: `conversation_id`, `direction`, `sender` (customer / agent / staff / system), `body`, `channel_message_id`, `created_at`. Text only; no secrets. Retention to decide with F21.
- `conversation_outcomes`: `conversation_id`, `type_key`, `outcome`, `lead_id`, `ticket_id`, `applied_at`. Unique per (conversation, type), so running the router again updates instead of duplicating.
- `classification_corrections`: `conversation_id`, `from_type`, `to_type`, `by_user_id`, `created_at`.
- `block_list`: **either** `phone_key` (digits, the form contacts use) **or** `email` (lower case), never both (a database rule), plus `reason`; unique per business. The number with its plus is worked out when shown, so nothing is stored twice. Saved as a whole list by `PUT /block-list` (an entry already there keeps its id and date); managers only; numbers and emails never reach the activity log.
- Business code cannot delete a conversation, a message or an outcome, nor change the business or `created_at` (column grants, as in F14).
- **Starting types are written the first time the list is read** (a business with none is given the 13 system types plus its industry's extras, in one transaction). New and existing businesses are treated alike, and no sign-up change or backfill is needed. Slice 1 also leaves out `route` (who owns what the router raises): the business's existing sharing rule decides until teams exist (F02).
- `alert` holds `{ who, when }` only; sending alerts is F23.
- **At most 25 active types per business, enforced by the database** (migration 032: a trigger with a per-business lock, so two requests at once cannot both pass). The service checks first for a friendly answer and also turns the database's refusal into the same 409 `TOO_MANY_TYPES`. Design review: R57.

## API (10 routes)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/conversation-types` | staff | The business's types with outcomes and alerts |
| POST | `/conversation-types` | manager | Add a custom type |
| PATCH | `/conversation-types/{id}` | manager | Edit label, description, examples, outcome, alert, routing |
| DELETE | `/conversation-types/{id}` | manager | A custom type only; its conversations move to `unclear` |
| POST | `/conversation-types/reorder` | manager | Reorder |
| GET, PUT | `/block-list` | manager | Numbers and emails treated as spam |
| POST | `/conversation-types/test` | manager | Classify a sample text, save nothing |
| GET | `/conversations/{id}` | staff (not the own-leads-only role) | One conversation with its messages and what it led to |
| POST | `/conversations/{id}/type` | staff (not the own-leads-only role) | Staff correction; re-runs the router; confirms an AI-unsure type |

## Slices (each at most 2 routes; stop after each for the owner to verify; slice 7 was split into 7a, 7b and 7c at the owner's choice, 16 Nov 2026)
| Slice | Builds | Routes |
| --- | --- | --- |
| 1 | **Built, waiting for the owner's check.** Migration 031, the system types and industry presets, the types list and add | `GET /conversation-types`, `POST /conversation-types` |
| 2 | **Built, waiting for the owner's check.** Edit and remove a type (migration 033) | `PATCH /conversation-types/{id}`, `DELETE /conversation-types/{id}` |
| 3 | **Built, waiting for the owner's check.** Reorder | `POST /conversation-types/reorder` |
| 4 | **Built, waiting for the owner's check.** Block list (migration 034) | `GET /block-list`, `PUT /block-list` |
| 5 | **Built, waiting for the owner's check.** The pre-filter and `router.decide` (pure code, unit tests for every row of the design; no route) | none |
| 6 | **Built, waiting for the owner's check.** The classifier through the AI service, the "Try it" route and the classification eval set v1 (English, hotel) | `POST /conversation-types/test` |
| 7a | **Built, waiting for the owner's check.** The tables `conversations`, `conversation_messages` and `conversation_outcomes` (migration 035), and the sorting step: store a conversation and its messages, run the rules, ask the AI, run the router, save the type and one outcome per type. A background job, `conversations.sort_conversation`, runs it. Lead and ticket outcomes are only recorded here. No route. | none |
| 7b | **Built, waiting for the owner's check.** Applies the outcomes for real: finds or creates the contact, and creates the lead or ticket (or joins the open one) through the contacts, leads and tickets modules, with the re-enquiry rule R6 (a lead lost less than 60 days ago is reopened). Facts about open leads and tickets go to the router. | none |
| 7c | **Built, waiting for the owner's check.** The staff correction and reading a conversation: `POST /conversations/{id}/type` (re-runs the router; a lead becomes a ticket and the other way, keeping the timeline) and `GET /conversations/{id}`; migration for `classification_corrections`; a removed type's conversations move to `unclear`. | `GET /conversations/{id}`, `POST /conversations/{id}/type` |

## Screens (for when the designer delivers)
Settings → Conversation types (each type as a sentence, edit form, Try it box); block list; Change type on the inbox, lead and ticket pages; the Filtered tab. No screen is built now.

## Rules to enforce
- **The built-in (system) types are always on and cannot be removed** (decided at slice 2, owner to confirm): the router needs them as its fallbacks (`unclear` for low confidence, `spam` for the block list, `no_conversation`, `automated` and `internal` for the code rules). They can be renamed and re-routed. Switching one off answers 409 `SYSTEM_TYPE_ALWAYS_ON`; removing one answers 409 `SYSTEM_TYPE_CANNOT_BE_REMOVED`, and the database refuses it too (migration 033).
- **Reorder lists every type of the business exactly once** (like offerings): a missing, repeated, extra or unknown id, including another business's, answers 400 `TYPES_MISMATCH` and never says whether the id exists. Positions become 0, 1, 2 with no gaps; the same order again changes nothing and writes no log line. Adding and reordering take turns (a per-business lock).
- Removing a custom type leaves history alone (a ticket keeps its type key as text). When conversations arrive (slice 7), a conversation whose type was removed moves to `unclear`.
- The AI says what it was about; **code decides what to do** (the router is pure and has a unit test per row).
- Confidence ≥ 0.70 apply; 0.40 to 0.70 apply and mark "AI unsure"; below 0.40 treat as `unclear` (needs review, no lead or ticket yet).
- More than one reason can give more than one outcome, each stored once per conversation and type.
- Open records are reused (an open lead or ticket gets the new conversation).
- An outcome whose module is off falls back (lead off → log plus a callback task).
- Contacts are kept for every type except `spam`, `wrong_number`, `no_conversation` and `automated`.
- Lifecycle stage moves only on sales outcomes.
- System types can be renamed and re-routed but never deleted; up to 25 active types per business.
- The classifier reads facts from our database, never from what the person claims; no personal data or message text in logs.
- A correction lead → ticket closes the lead as `reclassified` (kept, off the board) and opens a ticket with the same timeline.

## Router decisions made at slice 5 (owner to confirm)
- **Only the main reason can become "unclear".** A secondary reason the AI is not fairly sure about (below 0.40), or that does not exist or is switched off, is simply left out: a guess must not create work or review noise.
- **At most one outcome of each kind per conversation.** A complaint plus a booking enquiry still gives a ticket and a lead (different kinds). Two types that would both make a lead make one lead, and two that would both make a ticket make one ticket: the first, which is the main reason, wins.
- **No contact is kept for** the types `spam`, `wrong_number`, `no_conversation` and `automated`, **and** for any type (including a custom one) whose outcome is Filtered or Ignored. Re-routing a built-in type to a ticket or a log does not make it a spam type.
- **A lead outcome with the lead engine off** becomes "only log it" plus a callback task (`createCallbackTask`); tickets are core and never fall back.
- **Pre-filter order:** silence or an empty chat, then machine-made email, then the block list, then the business's own staff. Silence is a call under 10 seconds where the caller did not speak (or it is not known); an empty chat is a web chat or WhatsApp conversation that ended with no message from the customer. Machine-made email: an `Auto-Submitted` header other than `no`, a `List-Unsubscribe` header, `Precedence` of bulk, junk or list, or a sender such as noreply@, no-reply@, donotreply@, mailer-daemon@, postmaster@ or bounce@.
- **The router never touches the database or the AI.** It takes the business's types, the classification, the person's open lead and ticket, and what is switched on, and returns the outcomes with their ticket kind and priority, who to alert, whether to reuse an open record, whether a contact is kept, and whether the lifecycle stage may move. Slice 7 applies them.

## Sorting a conversation (slice 7a)
- **Tables (migration 035):** `conversations` (one per conversation on any channel: channel, who was on the other end as phone digits and/or email, the contact once known, the type and who decided it, how sure, a short reason, "AI unsure", "needs a person", open or sorted, and when it ended and was sorted), `conversation_messages` (written once, never edited or deleted; the channel's own message id keeps a repeated message from being stored twice), `conversation_outcomes` (one per conversation and type, with room for the lead or ticket it made and a "no longer applies" time). A database rule says a conversation is "sorted" only when it has a type, who decided it and a time. Business code cannot delete a conversation or a message, nor change a conversation's channel or who it was with.
- **Public entry points** (the module's `index.ts`, for the channels): `createConversationRecordsService` (start a conversation, add a message) and `createConversationFinaliser` (sort it), plus the background job `conversations.sort_conversation` that a channel queues when a conversation ends (for a call or an email it passes the facts only the channel knows: call length and whether the caller spoke, or the email headers; these are not stored).
- **The steps:** read the conversation, its messages, the business's switched-on types, the block list and the team's own phone numbers and emails (the auth module gives these two through its `index.ts`); the rules decide first (silence, empty chat, machine-made email, blocked, own team); a conversation with nothing from the customer is "no conversation" without the AI; otherwise the AI reads the whole conversation (business lines too, system lines left out); the router decides; the type and the outcomes are saved in one transaction under a row lock.
- **Safe to run twice and to retry:** no transaction is held open during the AI call; a conversation that is already sorted is left alone ("already sorted", no new AI call); if the AI cannot answer, nothing is changed and the job fails so it is tried again; sorting again on request (a correction) supersedes the outcomes that no longer apply and never stores a type twice. **Known limit:** two sortings at the same moment both ask the AI (one answer is thrown away); only one is saved.
- **Nothing of what was said** goes into the activity log, the event, the AI call record or any other record than the messages themselves.
- **Not yet in this slice:** creating the contact, the lead or the ticket (7b); reading a conversation and the staff correction (7c); the channels that start conversations (F20 onward).

## Carrying out what a conversation led to (slice 7b)
- **Entry points added to the other modules (their `index.ts`):** contacts `findOrCreateContactFromIdentity`, `findContactIdByIdentity`, `lockContactForUpdate`; leads `applyLeadFromConversation`; tickets `applyTicketFromConversation`. Each takes the caller's transaction and joins it, so the contact, the lead or ticket, the log lines and the events are saved together or not at all. The rules (R6 for leads, joining an open ticket) stay in the leads and tickets modules.
- **The steps:** after the conversation is sorted and saved, a second transaction locks the conversation, finds or makes the contact (not for spam, wrong numbers, silence or machine mail, nor for any type whose outcome is Filtered or Ignored, unless the outcome is a lead or a ticket) and links it, then carries out each outcome not carried out yet: a lead, a ticket (or a note on the person's open ticket of the same kind), or nothing for log, Filtered, ignored and review. Each outcome records the lead or ticket it made or joined and when.
- **Decisions (R59, owner to confirm):** an anonymous visitor cannot become a lead or ticket (the outcome waits and the conversation is marked "needs a person"); a lead lost less than 60 days ago is reopened (owner stays, `lead.reopened` event); a ticket's title is the type's name and its details are the AI's one-line reason, never the customer's words; the actor recorded is the classifier or the pre-filter.
- **Safe to retry:** if carrying out fails, nothing is half-made (a test makes lead creation fail and checks that the contact is rolled back too); the retry does not ask the AI again and carries out only what is left. Two conversations from one new person sorted at the same moment give one contact and one lead (the contact is locked first).
- **Router note:** the router's "reuse an open lead or ticket" hints are advisory; the leads and tickets modules decide with fresh facts under a lock, so the finaliser does not pass open records to the router.

## Reading and correcting a conversation (slice 7c)
- **Routes:** `GET /conversations/{id}` (the conversation, who was on the other end, the contact, the type and why, the messages in order, and each outcome with the lead or ticket it made) and `POST /conversations/{id}/type` (a person sets the type; answers with the conversation as it is now). Managers and staff; the "own leads only" role gets 403 (R60); another business's conversation is 404.
- **Migration 036:** `classification_corrections` (from, to, who, when; written once; the database refuses "from" equal to "to") and a note on each outcome of whether the conversation MADE its lead or ticket or only joined one.
- **A correction** runs the router again with the chosen type as the main type (confidence 1, source "staff"), carries out the new outcomes, and takes off what the conversation itself made for outcomes that no longer apply: a lead is kept and lost as "Reclassified (not a sale)", a ticket is kept and closed with a note. A lead or ticket the conversation only joined, or that another conversation also counts on, is left alone. All in one transaction. A conversation that is not sorted yet answers 409; a type the business does not have or has switched off answers 400 `UNKNOWN_TYPE`.
- **Confirming:** choosing the type it already has changes nothing, except that a type the AI was only fairly sure about stops being "AI unsure" (not counted as a correction).
- **Removing a type** now moves the conversations sorted as it to "unclear" and marks them "needs a person".
- **Not in this slice:** the screens (Change type menus, the Filtered tab), the accuracy report (F28), the timeline (F07).

## The classifier and "Try it" (slice 6)
- **Where:** `helpers/classifier-prompt.ts` (the prompt, the answer's shape, pure), `services/conversation-classifier.service.ts` (asks the AI), `services/conversation-type-trial.service.ts` ("Try it"), `scripts/eval-classification.ts` and `evals/classification/hotel_resort.jsonl` (the measurement).
- **The AI is asked for the job `classify_conversation` through the AI module's service** (F37 picks the model and key from the business's own settings; this code never names a model). Defaults today: Gemini Flash-Lite first, GPT-4o mini next. Temperature 0.
- **The answer must fit a shape built from the business's switched-on types:** an unknown or switched-off type is refused, so the AI cannot invent one (the call then answers 502 `AI_FAILED`).
- **The prompt keeps the steady part (rules and the type list) separate from the conversation,** so the AI company can cache it. The conversation is wrapped in markers, a closing marker typed by a customer is removed, and the rules say that text in the conversation is data and never to be obeyed. A conversation longer than 12,000 characters keeps its start and its end.
- **The AI only names the type.** Facts such as "has an open lead" come from our records and are stated separately from the conversation. What happens next is the router (slice 5).
- **Try it** (`POST /conversation-types/test`, managers only, limited to 10 a minute): sorts a pasted message with the business's own types and shows what the router would do. It saves nothing; the AI call record holds no text.
- **The measurement:** `npm run eval:types` sorts the labelled English examples with the real AI and prints three numbers against the targets (main type right 90%, complaints kept 95%, non-sales made leads at most 5%). It needs an AI key in `.env`, costs a few thousand tokens, and does not touch the database. The example file has 58 hotel examples, including complaints that also ask a price and messages that try to give the AI orders. Malayalam and Hindi sets come with voice (F29).

## Tests
- **Unit (no database, no AI):** `router.decide` (every threshold, multi-type, fallback, module-off and re-run case); the pre-filter rules; the classifier prompt and the shape of the AI's answer; the example set and its scoring.
- **API (local test database, scripted AI):** every route works / 401 / 403 / 404 (another business) / 400 / 409; types and the block list per business; the 25-type limit under parallel requests and directly in the database; the sorting (rules, AI, retry, concurrent, AI failure); making the contact, lead and ticket (R6 reopen and new, join, concurrent, failure rolled back, retry); the correction (lead to ticket, ticket to lead, filtered to enquiry, shared and joined records left alone, confirm); nothing of what was said in the log, events, tickets or AI records; the database refusing edits to messages and corrections.
- **Isolation:** the new routes and tables are registered in `isolation.test.ts`.
- **Evals:** `npm run eval:types` (needs an AI key in `.env`; run by the owner; never against `DATABASE_URL` data except through the script's own AI calls, which touch no database).
- **Counts at hand-off:** the full API suite passes (115 files, 1,515 tests); see the hand-off message for the full `npm run verify`.

## Manual test script
Prepare once: `npm run db:migrate` (migrations 031 to 037), `npm run dev`, and in Postman open the collection **Toobler One - F15 conversation types (run in order)** with the environment **Toobler One - local dev** (a manager of a verified business, with an AI key or the platform's AI switched on for it).

1. **Types.** Run folders 0 to 3. You should see 13 types (16 for a hotel), a custom type added, and the refusals (409, 400).
2. **Change and remove (folders 4 to 6).** Rename a custom type: the key stays. Make it a ticket without a kind: 400. Switch a built-in type off: 409. Remove a custom type: 204; remove it again: 404; remove a built-in one: 409.
3. **Reorder (folder 7)** reverses the list and puts it back; leaving one type out gives 400.
4. **Block list (folder 8).** Save a number in different ways: it comes back as `+919847012345`; the email in lower case; the same number twice gives 400.
5. **Try it (folder 9).** Paste a booking enquiry (a lead), a complaint (a high-priority ticket and an alert to the manager), a supplier pitch and a job request (only logged), and "hello" (unclear, a person looks). Change "General question" to log only (`PATCH /conversation-types/{id}` with `{"outcome":"log"}`) and try a general question again.
6. **A whole conversation.** Run `npm run conversation:simulate -- --email <your manager email> --text "The AC in room 204 broke last night. Also what does a March stay cost?" --phone 919847012345 --allow-remote`. It prints the type and the lead and ticket it made. In the app, or `GET /leads` and `GET /tickets`, you should see a lead and a high-priority ticket for a contact with only that phone number. Run it again with the same phone and a similar text: the enquiry joins the same lead and a repeat complaint adds a note to the same ticket.
7. **Without a phone.** Run the same command without `--phone`: the lead and the ticket wait, and the conversation is marked "needs a person" (nobody could be identified).
8. **Correct it (folder 10).** Set the Postman variable `conversationId` to the id the script printed. Read the conversation; correct it to a complaint, then back to a new enquiry. The lead the conversation made is lost as "Reclassified (not a sale)" and a complaint ticket appears; correcting back closes that ticket with a note and opens a lead. Choosing the type it already has changes nothing.
9. **Measure it (optional, spends a few thousand tokens):** `npm run eval:types`.

There is no browser screen for this feature: the screens wait for the designer.

## Security checklist
Reviewed on 16 Nov 2026 with the `api-security` skill.
- [x] Every new table has `account_id`, row-level security enabled **and forced**, and a policy (checked in the database for all six tables; the schema test enforces it).
- [x] The business comes from the session, the job's business context or the caller, never from a body, query or address part. Another business's conversation, type or id gives 404 (the isolation suite and each feature test prove it); the reorder answers 400 for any list that is not exactly the business's own types, so it never says whether an id exists.
- [x] Every query filters by the business as well as the id (checked by script on every by-id query in the module); raw SQL is only the per-business advisory locks, with the value passed as a parameter.
- [x] Roles on the route: all type changes, "Try it" and the block list are manager only; reading and correcting a conversation is managers and staff, and the "own leads only" role is refused (R60).
- [x] Validation (zod, strict, with limits) on every body and address part; the AI's answer is validated against a shape built from the business's own keys.
- [x] The AI is told that the conversation is data, a closing marker typed by a customer is removed, the AI only names a type (it never decides actions or sees tools), and "Try it" is limited to 10 a minute because each try spends AI quota.
- [x] Nothing of what a customer said, and no phone number, email or blocked entry, is written to the activity log, an event, a ticket, a note or the AI usage record (tests assert this); no `console` or logger use in the module; `process.env` only in `kernel/config.ts`.
- [x] Records are never deleted by a correction (a lead is lost as "Reclassified", a ticket closed with a note); messages and corrections cannot be edited or deleted by business code (the database refuses).
- [x] Concurrency: advisory locks and row locks for reorder, the block list save, sorting, and the contact-first lock for leads and tickets; the 25-type limit is also a database rule.
- [ ] Customers' words are sent to the AI company whose key is used (the business's own or the platform's). This is by design for every AI feature, but the privacy notice, the data processing agreement and message retention belong to F24 and F21: **not done here, recorded in the known limits.**
- [x] `npm audit --audit-level=high` is clean (9 moderate findings remain, R44); no new package was added.

## Decisions and differences from the requirements
- R1 and R21 (one list of types, one `conversations` table) are built here as designed; the design document `docs/CONVERSATION-TYPES.md` lists where the code differs (no `route` column, alerts hold only who and when, system types always on, starting types written on first read, the limit of 25 as a database rule, conversations without `held_*`, `summary` and `done_at` yet).
- **R56** (start of F15): messages stored now; models by the F37 order; no separate test feed.
- **R57:** the database design review and the limit of 25 enforced in the database.
- **R58:** the first release sorts only after a conversation ends; the live type comes after Phase 1; the classifier lives in `core.conversations` (ARCHITECTURE.md §3 updated).
- **R59:** how the contact, lead and ticket are made, the anonymous visitor, the re-enquiry rule, and what is recorded.
- **R60:** who can read and correct conversations, and what a correction does.
- Owner choice (16 Nov 2026): slice 7 was built as 7a, 7b and 7c, with a simulate script instead of a channel.
