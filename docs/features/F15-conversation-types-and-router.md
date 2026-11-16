# F15: Conversation types and the router

**Requirements:** [docs/CONVERSATION-TYPES.md](../CONVERSATION-TYPES.md) (the design; replaces three lists in scoring, email and tickets, see R1 and R21); `requirements/phase-1-lead-engine/2-crm-core/07-lead-scoring-and-filtering.md`, `3-ai-agents-and-channels/06-email.md`, `4-staff-workspace/06-tickets.md`; docs/plan/PHASE-1.md (F15)
**Depends on:** F00, F01, F03, F04, F06, F14, F37 (the AI service)      **Module:** `core.conversations` (core: always on; requires `core.contacts`, `core.leads`, `core.tickets`, `core.ai`)
**Status:** `in_progress` (started 16 Nov 2026). Built in slices of at most 2 routes. The screens wait for the designer.

## Feature guide

*Draft written at slice 4 so the rules are not lost; it is checked and finished again at hand-off, when the router and the AI sorting exist. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
People contact a business for many reasons, and only some of them want to buy. This feature gives every business a list of **conversation types** (new enquiry, complaint, supplier, job seeker, spam and so on). Each type says **what should happen** to a conversation of that kind: it becomes a lead, it becomes a ticket for someone to handle, it is only noted, it goes to the Filtered tab, it is ignored, or a person looks at it. So complaints do not clutter the sales board, and real enquiries are not buried under spam.

*So far (slices 1 to 4)* the business can see and manage its list of types and its block list. *Still to come in this feature:* the code that decides what happens (the router), the AI that reads a conversation and names its type, the "Try it" test box, and the staff correction ("this is not a lead, it is a service request").

### Why it is useful
- The sales board stays trustworthy: only real enquiries become leads.
- A complaint becomes a high-priority ticket for the manager instead of being lost.
- Each business decides what happens to each kind of conversation, in its own words, without a developer.
- A known spammer or a salesperson who keeps calling can be blocked once and never reaches the AI.

### How it works: a day in the life
1. A hotel signs up. The first time the manager opens the list, the business is given 13 built-in types and three hotel extras ("In-house guest request", "Lost and found", "Event or group enquiry").
2. The manager finds that "General question" fills the board with cold leads. They change what happens to it to "only note it".
3. They add their own type, "Wedding enquiry", that becomes a lead and tells the owner at once.
4. A number keeps calling to sell insurance. The manager adds it to the block list with the reason "insurance seller". From now on that number is treated as spam before any AI is asked.
5. They drag "Complaint" to the top of the list. Later, when the router is built, a guest complaint becomes a high-priority ticket and the manager is alerted at once.

### Who can do what
| | Manager | Staff | Own-leads-only staff |
| --- | --- | --- | --- |
| See the types | Yes | Yes | Yes |
| Add, change, switch off, remove or reorder types | Yes | No | No |
| See and change the block list | Yes | No | No |

(The full picture of roles is in `docs/ROLES-AND-ACCESS.md`.)

### Settings and limits
| What | Value |
| --- | --- |
| Built-in types | 13 for every business, plus extras for hotel, clinic, car dealer, school, travel agent and real estate. They can be renamed and re-routed, but never switched off or removed. |
| Your own types | Up to 25 types can be switched on at once (the AI reads all of them each time, so more would make it slower and less accurate). Types switched off do not count. |
| A type's words | Name up to 80 characters, description up to 500, up to 5 examples of up to 300 each |
| What can happen | Make a lead, make a ticket (with its kind and priority), only note it, send to Filtered, ignore, or ask a person to look |
| Block list | Up to 500 numbers or emails, each with an optional reason of up to 200 characters |

### What it never does
- Show or change another business's types or block list.
- Remove or switch off a built-in type.
- Write a blocked number, email or reason into the activity log.
- Decide anything with the AI alone: the AI only says what a conversation was about, and fixed rules decide what to do about it.

### What is not part of it
Sending the alerts (F23), the inbox and staff takeover (F21), the AI agent that talks to customers (F19), the channels that bring conversations in (F20 onward), and the screens (waiting for the designer).

### For the tech team
- **Module:** `core.conversations` (core, always on; requires contacts, leads, tickets and AI).
- **Tables:** `conversation_types` (031; 032 adds the active-types limit trigger; 033 allows deleting custom types and blocks deleting system ones), `block_list` (034).
- **Routes so far (7):** `GET, POST /conversation-types`, `POST /conversation-types/reorder`, `PATCH, DELETE /conversation-types/{id}`, `GET, PUT /block-list`. Who may call each: `docs/ROLES-AND-ACCESS.md` section 5.
- **How it works inside:** starting types come from `helpers/default-conversation-types.ts` and are copied per business on first read; the limit of 25, the ticket-field rule, the one-of-phone-or-email rule and the protection of system types are database rules, not only service checks; reorder and the block-list save take a per-business advisory lock.
- **Known limits:** presets for a new industry reach only businesses that have not read their list yet; no `route` column until teams exist (F02); a removed type's conversations move to `unclear` once conversations exist (slice 7); see R57 for the design review.

## Decisions made at the start (owner, 16 Nov 2026)

1. **Messages are stored now.** F15 creates the `conversations` and `messages` tables, because the router, the agent (F19) and every channel need the history. (R56)
2. **Any model can be used; the defaults are a small, cheap one.** F15 asks F37 for the job `classify_conversation`. F37 already orders it: **Gemini Flash-Lite (latest) first, GPT-4o mini second**, then the other small models. A business can change the order in its own AI settings. F15 never names a model.
3. **No special "feed" for the router.** The channels (F20 website chat first, then WhatsApp, email and calls) are what feed it. Until then it is tested with unit tests, API tests that create conversations directly, a labelled example set (the classification eval) and the **`POST /conversation-types/test`** route ("Try it": classify a pasted message, save nothing).
4. **F15 builds the engine's "decide what this was" part only.** It does not create conversations from any provider (the channels do), and it does not run the agent (F19).

## Scope
- **In:** the tables `conversation_types`, `conversations`, `messages`, `conversation_outcomes`, `classification_corrections`, `block_list`; the 13 system types (and the industry presets) given to every business, new and existing; types API (list, add, edit, delete a custom one, reorder); block list; the pre-filter (pure code); `router.decide` (pure code); the classifier (one structured AI call, schema built from the business's own type keys); a "Try it" route; the **finalise** service (final type, router, outcomes applied: lead, ticket, log, filter, ignore, review); staff correction (`POST /conversations/{id}/type`) that re-runs the router and moves lead ↔ ticket; the classification eval set v1 (English).
- **Out (later):** the agent and its `set_conversation_type` tool and playbooks (F19); every channel (F20, F25, F26, F29); the inbox screens and staff takeover (F21); staff alerts (F23: F15 records who should be alerted, F23 sends); scoring (F10); reports; Malayalam and Hindi eval sets (voice, F29); the **screens** (Settings → Conversation types with the Try it box, block list, Change type menus, the Filtered tab): waiting for the designer.

## Reused from the hotel agent
- **Read:** `src/agent/{index.js,industry.js}`, `src/agent/shared/{conversation.js,prompt.js,schema.js}`, `src/modules/core/{conversations,inbox}`, `test/unit/{prompts,agentTools,agentInputs}.test.js`, `scripts/agent-eval.js`.
- **Reused:** the idea of building a prompt from the business's own facts plus a stable part (kept for F19), and the shape of the eval script (labelled examples, a score at the end).
- **Changed:** the old project had no classifier and no router: every conversation was handled inside each channel. Here one shared engine decides the type for every channel. Types, outcomes and the router are new work, written to docs/CONVERSATION-TYPES.md.
- **Left behind:** hotel-only prompt text and the per-channel conversation handling (it moves into the engine).

## Database (forward-only, one migration per change: `031_conversation_types.sql`, `032_conversation_types_active_limit.sql`, `033_conversation_types_delete.sql` and `034_block_list.sql` so far; the others with the slice that needs them)
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

## API (9 routes)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/conversation-types` | staff | The business's types with outcomes and alerts |
| POST | `/conversation-types` | manager | Add a custom type |
| PATCH | `/conversation-types/{id}` | manager | Edit label, description, examples, outcome, alert, routing |
| DELETE | `/conversation-types/{id}` | manager | A custom type only; its conversations move to `unclear` |
| POST | `/conversation-types/reorder` | manager | Reorder |
| GET, PUT | `/block-list` | manager | Numbers and emails treated as spam |
| POST | `/conversation-types/test` | manager | Classify a sample text, save nothing |
| POST | `/conversations/{id}/type` | staff | Staff correction; re-runs the router |

## Slices (each at most 2 routes; stop after each for the owner to verify)
| Slice | Builds | Routes |
| --- | --- | --- |
| 1 | **Built, waiting for the owner's check.** Migration 031, the system types and industry presets, the types list and add | `GET /conversation-types`, `POST /conversation-types` |
| 2 | **Built, waiting for the owner's check.** Edit and remove a type (migration 033) | `PATCH /conversation-types/{id}`, `DELETE /conversation-types/{id}` |
| 3 | **Built, waiting for the owner's check.** Reorder | `POST /conversation-types/reorder` |
| 4 | **Built, waiting for the owner's check.** Block list (migration 034) | `GET /block-list`, `PUT /block-list` |
| 5 | The pre-filter and `router.decide` (pure code, unit tests for every row of the design; no route) | none |
| 6 | The classifier through the AI service, the "Try it" route and the classification eval set v1 | `POST /conversation-types/test` |
| 7 | Finalise: store, classify, route, apply outcomes (lead, ticket, log, filter, ignore, review) and the staff correction | `POST /conversations/{id}/type` |

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

## Tests
- **Unit:** `router.decide` (every threshold, multi-type, fallback and re-run case); pre-filter rules (silent call, each auto-email header, block list, staff number); the schema built from a business's type keys.
- **API:** every route works / 401 / 403 / 404 (another business) / 400; types are per business (isolation); system types cannot be deleted; a correction moves lead ↔ ticket and keeps the timeline.
- **Evals:** `evals/classification/<industry>.jsonl`, English. Targets: primary type right ≥ 90%; complaint recall ≥ 95%; false lead rate ≤ 5%. Needs an AI key in `.env`; never run against `DATABASE_URL`.

## Manual test script (written fully at hand-off; slice by slice until then)
Each slice hand-off gives the Postman steps. At the end: use **Try it** with a booking enquiry, a complaint, a supplier pitch and a job request, and see each type and what would happen; change "General question" to log only and try again.

## Security checklist
To be ticked at hand-off with the `api-security` skill (account fence on every table; roles on every route; no text of messages in logs; the Try it route spends AI quota, so it is rate limited and manager only).

## Decisions and differences from the requirements
- R1 and R21 (one list of types, one `conversations` table) are built here as designed.
- R56 (this brief, 16 Nov 2026): messages stored now; models by F37 order, defaults Gemini Flash-Lite then GPT-4o mini; no separate test feed.
