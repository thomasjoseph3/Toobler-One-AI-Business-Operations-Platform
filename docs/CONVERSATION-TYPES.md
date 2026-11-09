# Conversation types: not every call is a lead

*Engineering design. Extends [requirements](../requirements/README.md); where it changes a requirement, the change is
listed in [REQUIREMENTS-REVIEW.md](REQUIREMENTS-REVIEW.md).*

## The problem

People call, WhatsApp, chat and email a business for many reasons. Only some are buying. If every conversation
becomes a lead, the board fills with complaints, "where is my order?", job seekers, suppliers, spam, wrong numbers and
the owner's own staff calling in. Staff stop trusting the board, and real enquiries get lost in the noise.

The requirements already touch this in three separate places, each with its own list:

| Where | Its list |
| --- | --- |
| [Scoring](../requirements/phase-1-lead-engine/2-crm-core/07-lead-scoring-and-filtering.md) | Filtered: silent calls, wrong numbers, spam, sales pitches, existing customers' service questions |
| [Email](../requirements/phase-1-lead-engine/3-ai-agents-and-channels/06-email.md) | `enquiry`, `existing_customer`, `question`, `complaint`, `other`, `automated` |
| [Tickets](../requirements/phase-1-lead-engine/4-staff-workspace/06-tickets.md) | `callback`, `question`, `complaint`, `existing_customer`, `other` |

This design replaces the three lists with **one per-business list of conversation types** that every channel uses.
Each type decides what happens next: a lead, a ticket, a log line, or the Filtered tab. Each type also has its own
alerts.

## The idea in one picture

```text
 call / WhatsApp / chat / email
            │
            ▼
 ┌─────────────────────┐   rules in code, no AI: silent call, auto-email, blocked number, staff's own number
 │ 0. Pre-filter        │──────────────────────────────────────────────────────────► type decided, skip AI
 └─────────────────────┘
            │
            ▼
 ┌─────────────────────┐   who is this? existing customer? open lead? open ticket?  (facts from our DB,
 │ 1. Context           │   never from what the customer claims)
 └─────────────────────┘
            │
            ▼
 ┌─────────────────────┐   the agent talks; when the reason is clear it calls set_conversation_type(...)
 │ 2. Live type (AI)    │   → the agent switches playbook (sales vs service) and urgent alerts go out now
 └─────────────────────┘
            │ conversation ends
            ▼
 ┌─────────────────────┐   one structured-output call on the whole transcript:
 │ 3. Final type (AI)   │   primary type + up to 2 secondary + confidence + needs_person + reason
 └─────────────────────┘
            │
            ▼
 ┌─────────────────────┐   pure code: the business's rules for each type → outcomes
 │ 4. Router (code)     │   lead | ticket | log only | filtered   + alerts + needs-person flag
 └─────────────────────┘
            │
            ▼
 ┌─────────────────────┐   staff can change the type from the inbox, lead or ticket; the outcome moves with it
 │ 5. Staff correction  │   and the correction is counted (accuracy report) and kept as an example
 └─────────────────────┘
```

**The AI says what the conversation was about. Code decides what to do about it.** This is the same principle as
"scoring is done by code": the same type always gives the same outcome, and the business controls the outcomes.

## Conversation types

A **type** is one reason a person gets in touch. Every business gets the system types; its industry preset adds a few
more; the manager can add their own.

### System types (every business; can be renamed, outcome can be changed, can't be deleted)

| Key | Means | Default outcome | Default alert |
| --- | --- | --- | --- |
| `new_enquiry` | Wants to buy, book, or know a price or availability | **Lead** | Hot lead alert (by score) |
| `general_question` | Asks something (hours, location, parking) with no sign of buying yet | **Lead, cold** (configurable to *log only*) | none |
| `existing_customer` | About something they already bought or booked: change, status, documents, invoice | **Ticket** `existing_customer` | Service team, office hours |
| `complaint` | Unhappy about something that happened | **Ticket** `complaint`, needs a person, priority high | Manager, **immediately** |
| `callback_request` | Only wants someone to call back, reason not given | **Ticket** `callback`, needs a person | Alert number |
| `vendor_or_partner` | Supplier, agent, partner, media, someone selling *to* the business | **Log only** | none |
| `job_seeker` | Asking for work | **Log only** | none |
| `spam` | Spam, scams, robocalls, abuse | **Filtered** | none |
| `wrong_number` | Meant to reach someone else | **Filtered** | none |
| `no_conversation` | Silent or very short call, empty chat (decided by code) | **Filtered** | none |
| `automated` | Newsletters, receipts, OTPs, auto-replies (decided by code where possible) | **Ignored** (not in inbox) | none |
| `internal` | The business's own staff numbers or emails (decided by code) | **Log only** | none |
| `unclear` | Not enough to tell, or the AI's confidence is low | **Needs review** in the inbox | Alert number, office hours |

`general_question` defaults to a cold lead because the scoring requirement says "Cold: only general questions". A
business that finds this noisy switches the outcome to *log only*. That is the configurability you asked for.

### Industry presets (examples; added at sign-up, editable)

| Industry | Extra types |
| --- | --- |
| Hotel / homestay | `in_house_guest_request` (towels, room service: ticket to front desk, urgent), `lost_and_found` (ticket), `event_or_group_enquiry` (lead, routed to the events person) |
| Clinic | `appointment_change` (ticket, existing customer), `report_or_prescription` (ticket, question), `emergency` (no AI handling: give the emergency number, alert immediately) |
| Car dealer | `test_drive` (lead), `service_booking` (lead or ticket, routed to the workshop team), `insurance_claim` (ticket) |
| School / coaching | `admission_enquiry` (lead), `fee_or_parent_query` (ticket, existing customer) |
| Travel agent | `visa_or_document_help` (lead), `trip_change` (ticket, existing customer) |
| Real estate | `site_visit` (lead, counts as hot), `tenant_or_maintenance` (ticket) |

### What each type holds

| Setting | Example | Used by |
| --- | --- | --- |
| `key`, `label` | `complaint`, "Complaint" | everyone; the label is the business's own word |
| `description` | "The customer is unhappy about a stay, a staff member, a charge or a delay" | the classifier prompt |
| `examples` (up to 5) | "The AC in room 204 didn't work all night" | the classifier prompt (few-shot) |
| `outcome` | `lead` / `ticket` / `log` / `filter` / `ignore` / `review` | the router |
| `ticket_type`, `priority` | `complaint`, `high` | the ticket the router raises |
| `route_to` | lead owner rule, a team, a person | who owns the lead or ticket |
| `needs_person` | yes | inbox sorting, agent hand-off |
| `alert` | who (owner, team, manager, alert number, a person), when (now, office hours), how (WhatsApp, email) | notifications |
| `agent_playbook` | `sales`, `service`, `brief_end`, `emergency` | how the agent continues the conversation |
| `active`, `sort` | | |

Limits: up to 25 active types per business, so the classifier prompt stays small and accurate.

## How a conversation gets its type

### 0. Pre-filter (code, before any AI)

Cheap, certain and free. When one of these matches, the type is set and the AI isn't asked:

| Rule | Type |
| --- | --- |
| Call under 10 seconds with no speech; chat closed with no visitor message | `no_conversation` |
| Email with `Auto-Submitted`, `List-Unsubscribe`, `Precedence: bulk`, or a `noreply@` sender | `automated` |
| Number or email on the business's block list | `spam` |
| Number or email of a staff member of this business | `internal` |

### 1. Context (facts from our database)

Before the agent replies, we look up the person by phone or email and pass **facts** to the agent and the classifier:
is this an existing contact? lifecycle stage (customer, repeat customer)? an open lead? an open ticket? when did we
last speak? These facts come from our data, never from what the person says ("I'm a customer" is a claim, not a fact).

### 2. Live type (the agent, during the conversation)

The agent's prompt lists the business's active types with their descriptions. When the reason becomes clear, it calls
the tool `set_conversation_type({ type, confidence, reason })`. That does three things at once:

- The agent switches playbook. A complaint gets an apology and a manager callback, not sales questions about dates
  and party size.
- Urgent alerts go out **during** the call (a complaint at 9 PM doesn't wait for hang-up).
- The inbox shows the type live.

The tool checks `type` against the business's list. An unknown type is refused and the agent is told the valid ones.

### 3. Final type (one call after the conversation ends)

When the conversation ends (hang-up, chat idle 30 min, WhatsApp idle 2 h, email processed), one structured-output call
reads the whole transcript plus the context facts and returns:

```json
{
  "primary":   { "type": "complaint", "confidence": 0.92 },
  "secondary": [{ "type": "new_enquiry", "confidence": 0.81 }],
  "needs_person": true,
  "reason": "Unhappy about AC in room 204 last night; also asked the price for a stay in March"
}
```

The output is checked with a zod schema built from the business's own type keys. The final type wins over the live
one. It runs on a small, cheap model with a low temperature; the model is chosen by the classification evals.

### 4. Router (pure code)

`router.decide(types, context, accountRules) → Outcome[]`, a pure function with a unit test for every row below:

| Confidence of a type | What happens |
| --- | --- |
| ≥ 0.70 | Apply its outcome |
| 0.40 – 0.70 | Apply its outcome and mark it **"AI unsure"** (a chip in the inbox; staff confirm with one tap) |
| < 0.40 | Treat as `unclear`: **needs review**, no lead or ticket yet |

- **More than one reason, more than one outcome.** A complaint plus a new booking gives a ticket *and* a lead. Each
  outcome is stored once per conversation and type (`conversation_outcomes`), so running the router again (after a
  correction or a retry) updates instead of duplicating.
- **Open records are reused.** A new enquiry from someone with an open lead goes onto that lead. A follow-up about
  the same complaint goes onto the open ticket.
- **An outcome whose module is off falls back.** If the lead engine is switched off, `lead` becomes `log only` plus a
  callback task. Each outcome kind belongs to a module (see [ARCHITECTURE.md](ARCHITECTURE.md#outcomes)).
- **Contacts are kept for every type except `spam`, `wrong_number`, `no_conversation` and `automated`.** For those, the
  conversation is kept under Filtered and no contact is created, so the contact list stays clean.
- **Lifecycle stage moves only on sales outcomes.** A complaint doesn't turn a contact into a "Lead".

### 5. Staff correction

Wherever a conversation, lead or ticket appears, staff can change its type ("This isn't a lead: it's a service
request"). The router runs again:

- lead → ticket: the lead is closed as `reclassified` (kept, off the board, not counted in reports) and a ticket opens
  with the same timeline;
- filtered → enquiry: it comes back onto the board (the requirement's "move a filtered item back").

Each correction is saved (`classification_corrections`: from, to, by, when). The business's latest corrections can be
added to its own classifier examples (opt-in, never shared between businesses), and the accuracy report shows how
often the AI was right.

## Alerts for customer service, not only sales

Each type carries its own alert, so customer service gets its own alerts:

| Type | Default alert |
| --- | --- |
| `complaint` | Manager and alert number, WhatsApp, **immediately, even at night** (a manager can limit it to office hours) |
| `existing_customer` | Service team (or the alert number), office hours |
| `callback_request` | Alert number, office hours; becomes "late" like any callback |
| `unclear` | Alert number, office hours: "1 conversation needs a look" |
| `in_house_guest_request` (hotel) | Front-desk number, immediately |
| `emergency` (clinic) | Doctor on call, immediately |
| `new_enquiry` | The hot-lead alert from [staff alerts](../requirements/phase-1-lead-engine/4-staff-workspace/03-staff-alerts.md), when the lead scores hot |

The morning summary splits by type: "Overnight: 6 enquiries (2 hot), 2 service requests, 1 complaint, 4 filtered."

## What the agent does differently by type (playbooks)

| Playbook | Types | The agent |
| --- | --- | --- |
| `sales` | `new_enquiry`, `general_question`, sales presets | Answers from the knowledge base, collects details and "AI should ask" fields, ends with one promise (requirements: how the agent behaves) |
| `service` | `existing_customer`, `complaint`, `callback_request`, service presets | Apologises where right, collects the order or booking reference and the issue, never argues or promises a refund, says the manager will call; raises the ticket |
| `brief_end` | `vendor_or_partner`, `job_seeker`, `wrong_number`, `spam` | Answers politely in one or two lines: for a supplier, "please email …"; for a job seeker, the careers line if the business gave one. Then ends. |
| `emergency` | presets like the clinic's `emergency` | Gives the business's emergency instruction word for word, alerts at once, no sales questions |

## Tables (Phase 1)

| Table | Holds |
| --- | --- |
| `conversation_types` | `account_id`, `key`, `label`, `description`, `examples` jsonb, `system`, `outcome`, `ticket_type`, `priority`, `route` jsonb, `needs_person`, `alert` jsonb, `playbook`, `active`, `sort` |
| `conversations` | one row per conversation on any channel: `account_id`, `channel`, `contact_id`, `type_key`, `type_confidence`, `type_source` (`rule`, `ai_live`, `ai_final`, `staff`), `ai_unsure`, `needs_person`, `status`, `held_by_user_id`, `held_until`, `summary`, `ended_at`, `done_at` |
| `conversation_outcomes` | `conversation_id`, `type_key`, `outcome`, `lead_id`, `ticket_id`, `applied_at`. Unique per (conversation, type). |
| `classification_corrections` | `account_id`, `conversation_id`, `from_type`, `to_type`, `by_user_id`, `created_at` |
| `block_list` | `account_id`, `phone_key` or `email`, `reason` |

## Endpoints (added to API.md Phase 1)

| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| GET | `/conversation-types` | The business's types with outcomes and alerts | Staff |
| POST | `/conversation-types` | Add a custom type | Manager |
| PATCH | `/conversation-types/{id}` | Edit label, description, examples, outcome, alert, routing | Manager |
| POST | `/conversation-types/reorder` | Reorder | Manager |
| DELETE | `/conversation-types/{id}` | Remove a custom type (asks first; its conversations move to `unclear`) | Manager |
| POST | `/conversation-types/test` | Classify a sample text, without saving anything | Manager |
| POST | `/conversations/{id}/type` | Staff correction: set the type, which re-runs the router | Staff |
| GET, PUT | `/block-list` | Numbers and emails to treat as spam | Manager |

## Screens

- **Settings → Conversation types:** each type with its outcome as a plain sentence ("Complaints → a ticket for the
  manager, alert at once"). Edit opens a form: label, description, examples, outcome, owner, alert. A **Try it** box:
  paste a message, see which type it gets and why.
- **Inbox:** a type chip on every conversation, an "AI unsure" chip where it applies, and a **Change type** menu.
- **Lead page and ticket page:** **This isn't a lead / This isn't a ticket → Change type**.
- **Leads → Filtered tab:** filtered conversations grouped by type, each with **Move to leads**.
- **Reports:** conversations by type, and how often the AI's type was right (from corrections).

## How we test it

| Test | Proves |
| --- | --- |
| Unit: `router.decide` | Every outcome, threshold, fallback, multi-type and re-run case gives the expected result |
| Unit: pre-filter rules | Silent call, each auto-email header, block list and staff number |
| API | Types are per business (isolation), system types can't be deleted, a correction moves lead ↔ ticket and keeps the timeline |
| Classification evals | `evals/classification/<industry>.jsonl`: labelled conversations in English, Malayalam and Hindi. Targets: primary type right ≥ 90%; **complaint recall ≥ 95%** (a complaint must never be lost as a lead); **false lead rate ≤ 5%** (non-sales becoming leads). Runs on every prompt, model or type-preset change. |
| Agent evals | A complaint call doesn't get sales questions; a supplier call ends politely in two turns |
| Manual | Settings → Conversation types → **Try it** with your own real messages |

## Later phases plug in here

- **Sales engine (Phase 2)** adds outcome kinds (`booking_change` handled by its booking tools) and switches
  `existing_customer` from "ticket" to "the booking tools first, a ticket if the AI can't do it".
- **Service engine (Phase 3)** takes over the `ticket` outcome with ticket pipelines, routing by skills and SLAs. The
  types list stays the same.
- **Automation (Phase 5)** lets "a conversation got type X" start a workflow.
- **Agent builder (Phase 7)** can give a type its own custom agent.

None of these change the core: each registers outcome handlers and playbooks through its module manifest.
