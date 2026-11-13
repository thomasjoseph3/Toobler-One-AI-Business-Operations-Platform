# F14: Tickets

**Requirements:** `4-staff-workspace/06-tickets.md`; `requirements/API.md` (Tickets); docs/CONVERSATION-TYPES.md; docs/plan/PHASE-1.md (F14)
**Depends on:** F00, F01, F04      **Module:** `core.tickets` (core: always on, no switch; requires `core.contacts`)
**Status:** approved by the owner on 12 Nov 2026 (backend; the ticket screens wait for the designer). All slices tested by the owner in Postman.

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
A **ticket** is a request that is not a sale: a complaint, a question about a past order, a callback, or something the AI could not answer. Keeping these off the leads board keeps sales clean and makes sure an unhappy customer gets an answer. Staff assign a ticket, add notes, and close it.

### Why it is useful
- **Complaints are not lost** among new enquiries.
- **Clear ownership:** every ticket can have a person responsible, and "Unassigned" shows what nobody has taken yet.
- **A simple history:** notes show who said what and when.

### How it works: a day in the life
1. A guest complains about noise. A ticket (type "complaint", priority "high") is added for their contact.
2. The manager assigns it to Meera. Meera adds a note ("Called the guest, moved them to a quiet room").
3. She closes the ticket. The guest comes back the next day with a follow-up; she reopens it and adds another note.
4. At any time the team can list "my tickets", "unassigned" tickets, or all tickets of one contact.

### Who can do what
Every signed-in person, including the "own leads only" role, can see and work every ticket (tickets are shared work). There is no delete in Phase 1.

### Settings and limits
| What | Value |
| --- | --- |
| Type | callback, question, complaint, existing customer, other |
| Priority | low, normal (default), high, urgent |
| Status | open or done |
| Notes | 1 to 2,000 characters each; never edited or deleted |
| A closed ticket | Takes a note or a reopen; any other change is refused unless it also reopens |

### What it will never do
- Let a ticket belong to another business's contact or owner.
- Change or delete a note.
- Write a title, details or note words into the activity log or events.

### Not part of this feature
The ticket screens (designer), the AI's "raise a ticket" tool (F19), the router (F15), alerts when a ticket is raised (F23), and replying on the customer's channel (Phase 3).

### For the tech team
- **Module:** `core.tickets` (requires `core.contacts`). Migration `013_tickets.sql`: tables `tickets` and `ticket_notes` (the app role has no update or delete on notes; there is no delete on tickets). The closing time is required exactly when the status is `done` (database check).
- **Routes (4):** `POST /tickets`, `GET /tickets/{id}` (with notes, oldest first), `GET /tickets` (filters `status`, `ownerUserId` = `me`/`unassigned`/a person, `type`, `priority`, `contactId`; paging), `PATCH /tickets/{id}` (assign, edit, add a note, close with `status: done`, reopen with `status: open`).
- **PATCH** writes only fields that change; `{}` is 400 `NOTHING_TO_CHANGE`; a closed ticket answers 409 `TICKET_CLOSED` to other changes.
- **Events:** `ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.note_added`, `ticket.closed`, `ticket.reopened` (ids and field names only) for alerts (F23) and the timeline (F07).

### Known limits
- No alerts yet when a ticket is raised or assigned (R45, F23).
- A disabled person can still own a ticket until F02 (R39).
- No screens yet (designer).

---

**Goal in one line:** a ticket is a request that is not a sale (a complaint, a question about a past order, a callback,
something the AI cannot answer). Keeping these off the leads board keeps sales clean and makes sure an unhappy customer gets
an answer. Staff assign a ticket, add notes, and close it. The router (F15) and the AI agent (F19) will raise tickets later.

## Questions for the owner (my default in bold)
1. **Notes.** Can a ticket have many notes (each with who and when), or only one note written when closing?
   **Many notes, in a small `ticket_notes` table.** The real timeline is F07; this is the simple version until then.
2. **Who sees tickets.** **Every signed-in person of the business sees every ticket, including "own leads only" people**
   (tickets are shared work; the plan says "confirm, review item R10"). The alternative is to hide other people's tickets from
   that role, as we did for leads.
3. **Who may assign, close and reopen.** **Any staff member can assign, add notes and close; a closed ticket can be reopened.**
   Only managers can delete (and there is no delete route in Phase 1).
4. **A new ticket with no owner.** **It may stay unassigned; the list has an "Unassigned" filter.** No automatic sharing-out
   until routing rules exist (F02 / Phase 3). The manager alert comes with F23.

## Scope
- In: table `tickets` and `ticket_notes`; the four API routes (below); type and priority; assign; notes; close and reopen;
  activity-log lines and events (`ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.note_added`, `ticket.closed`,
  `ticket.reopened`) so F23 can alert and F07 can show them on the timeline.
- Out: the screens (designer, as for F01, F03, F04, F06); the AI's "raise a ticket" tool (F19); the router (F15); alerts
  (F23); replying on the customer's channel, ticket stages, response targets (Phase 3).

## Routes (4)
| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/tickets` | Add a ticket for a contact | Staff |
| GET | `/tickets/{id}` | One ticket with its notes (oldest first) | Staff |
| GET | `/tickets` | List, newest first; filters: `status`, `ownerUserId` (`me`, `unassigned` or a person), `type`, `priority`, `contactId`; `page`, `limit` | Staff |
| PATCH | `/tickets/{id}` | Assign, rename, details, type, priority, add a note, close (`status: done`), reopen (`status: open`) | Staff |

"Staff" here means every signed-in, verified person of the business: manager, staff and "own leads only" alike.

## Slices
| Slice | What | State |
| --- | --- | --- |
| 0 | Migration `013_tickets.sql`, table types, shared words, empty `core.tickets` module | done |
| 1 | `POST /tickets`, `GET /tickets/{id}` | done; owner tested |
| 2 | `GET /tickets` (filters and paging) | done; owner tested |
| 3 | `PATCH /tickets/{id}`: assign, edit | done; owner tested |
| 4 | `PATCH /tickets/{id}`: note, close, reopen | done; owner tested |
| 5 | Journey tests, security review, this hand-off | done; owner approved 12 Nov 2026 |
| UI | Tickets list and page, on the contact page | on hold (designer) |

## Screens (for when the designer delivers)
- **Tickets list:** rows with title, contact, type and priority (icon + word), owner, status, age. Filters: Open / Done, Mine,
  Unassigned, type, priority. Empty state: "No tickets yet". Loading and error states.
- **Ticket page:** details, contact, owner picker, notes (oldest first) with an "Add note" box, **Close** (asks for a note) and
  **Reopen**. A closed ticket shows who closed it and when.
- **Contact page:** an "Open tickets" block that asks the list for `?contactId=…&status=open`.

## Rules (as built)
- `type`: `callback`, `question`, `complaint`, `existing_customer`, `other` (default `other`). `priority`: `low`, `normal`
  (default), `high`, `urgent`. Status `open` or `done`; the database requires a closing time exactly when it is `done`.
- A ticket belongs to one contact of the business (another business's, a deleted or an unknown contact answers 404). Its owner is
  optional and must work for the same business (a composite foreign key; otherwise 404).
- `PATCH` changes only the fields sent; sending what is already stored changes nothing and writes no line. `{}` is 400
  `NOTHING_TO_CHANGE`; the contact, the business and unknown fields are refused with 400.
- **Closed tickets** take a note or a reopen. Any other change is 409 `TICKET_CLOSED`, unless the same request sends
  `status: open` (reopen and change in one step). Closing an already closed ticket, or reopening an open one, is 200 and writes
  nothing.
- Notes are 1 to 2000 characters, stored once, never edited or deleted (the app role has no UPDATE or DELETE on them).
- Tickets cannot be deleted in Phase 1 (no route; the app role has no DELETE).
- Activity-log lines (`tickets.created`, `tickets.updated`, `tickets.note_added`, `tickets.closed`, `tickets.reopened`) and events carry
  ids and field names only; the title, details and note words are never logged.

## Security checklist
Reviewed with the `api-security` skill on 12 Nov 2026 (the whole F14 diff: 4 routes, 2 tables, migration 013).

- [x] Every new table has account_id, RLS enabled + forced, and the schema test passes (`tickets`, `ticket_notes`).
- [x] Every new route: role guard (`staff`: any signed-in, verified person; there is no manager-only action in F14) and tests for
  works / 401 / 404 other business / 400 bad input. There is no 403-by-role case to test, because no ticket action is restricted by role;
  what is tested instead is that **every role** (manager, staff, own-leads-only) can read and work tickets, and that 403 is
  answered without the web app's headers. Routes with no id (`POST /tickets`, `GET /tickets`) have no "other business's id" to try;
  the nearest cases (a stranger's contact, owner or filter id) are tested and answer 404 or an empty list.
- [x] Every list respects staff_own: **by decision, tickets are business-wide for every role** (owner, 12 Nov 2026), so no filter is
  applied; tested for `staff` and `staff_own`. If the owner ever wants own-tickets-only, it is a service change plus tests (as for leads).
- [x] No business id taken from body, query, params or tool arguments. The business always comes from the session; the request
  schemas are `.strict()`, so an `accountId` is refused with 400 (tested).
- [x] All input validated with zod with max lengths; no SQL built from strings, and the tickets module has no raw SQL.
- [x] New public route / webhook / agent tool / outside call / file upload: none.
- [x] Nothing logged that is personal data or a secret: ids and field names only; tested that the title, details, note words and the
  contact's name appear in no log line or event. `process.env` is read only in `kernel/config.ts`.
- [x] Deletes: there is no delete. Setting changes and closing write the activity log (tested).
- [x] Secrets: none in F14.
- [x] `npm audit --audit-level=high` shows no high or critical finding (10 moderate, as before F14; F14 adds no package).
- [x] `npm run verify` parts that exist today pass (see the hand-off message); the e2e part waits for the screens.

Defence in depth added by the database: the owner must work for the same business (composite foreign key); a note can point only at
a ticket of its own business (composite foreign key); the app role cannot delete tickets or notes, cannot edit notes, and can change
only the editable ticket columns (never the business, the contact or who created it); a ticket is `done` exactly when it has a closing time.

Known limits, recorded rather than hidden:
- A disabled person can still be named as an owner (F02 adds disabling and the check).
- A request with a malformed body is refused with 400 before the sign-in check, so a signed-out caller can learn the field names.
  This is how every route of the app behaves, and the field names are public in the API docs; recorded, not changed here.
- The shared isolation suite now exists (R41, `apps/api/test/isolation.test.ts`): it holds an attempt for every ticket route, and fails if a route is added without one.
- No alert is sent when a ticket is raised or assigned. The events are published; alerts are F23.

## Decisions and differences from the requirements
- The requirements list one route for "assign, note, close"; it is `PATCH /tickets/{id}` with optional `note` and `status`
  (slices 3 and 4 widen the same route). A note can be sent together with a close, so "close with a note" is one step.
- **Notes:** many, in `ticket_notes` (owner chose the default, 12 Nov 2026). The real timeline is F07.
- **No open-ticket count on the contact.** The plan had "the open-ticket count on the contact summary". The contacts module
  cannot read tickets (tickets requires contacts, so contacts requiring tickets would be a loop). The contact page asks the tickets
  list instead: `GET /tickets?contactId=…&status=open` (its `total` is the count). Tested in the journey "tickets stay off the leads board".
- **Tickets never touch leads or a contact's lifecycle stage** (journey-tested). The router (F15) decides lead versus ticket.
- Priority was not in the requirement's table list; it is in the plan, and the router will set `high` for complaints.
- Type and priority words are in `packages/shared/src/tickets.ts`; the router will reuse them.

## Manual test script
The screens are parked for the designer, so F14 is tested through the API. Two ways, the same checks:

**A. Postman (recommended).** In Postman, My Workspace: collection *Toobler One - F14 tickets (run in order)* and environment
*Toobler One - local dev*.
1. Start the API (`npm run dev`, restart it so it has the new routes) and apply the migrations (`npm run db:migrate`: `013` must be applied).
2. In the environment, set `email` and `password` (**current** values) to a verified person of a test business, and select the environment.
3. Run the collection with the Runner, folders 0 to 5 in order. Every request checks its answer; all must pass. It leaves the test contact
   soft-deleted; the two test tickets stay (tickets cannot be deleted).

**B. By hand, the main path** (each step: what you send, what you should see):
1. Sign in. `POST /contacts` `{"name":"Priya Menon","phone":"+971501234567"}`.
2. `POST /tickets` `{"contactId":"…","title":"Unhappy about the room","type":"complaint","priority":"high"}` → 201, `status: open`, `ownerUserId: null`, `notes: []`.
3. `GET /tickets/{id}` → the same; `GET /tickets?status=open&ownerUserId=unassigned` → it is in the list, newest first.
4. `PATCH /tickets/{id}` `{"ownerUserId":"<your id>"}` → owner is you; `GET /tickets?ownerUserId=me` lists it; `{"ownerUserId":null}` → nobody.
5. `PATCH` `{"title":"…","priority":"urgent"}` → changed; `{}` → 400 `NOTHING_TO_CHANGE`; `{"contactId":"…"}` → 400.
6. `PATCH` `{"note":"Called the customer."}`, then another note → two notes, oldest first, each with who wrote it.
7. `PATCH` `{"status":"done","note":"Refund sent."}` → `done`, `closedAt` and `closedByUserId` set; `GET /tickets?status=done` lists it.
8. `PATCH` `{"title":"x"}` on the closed ticket → 409 `TICKET_CLOSED`; `{"note":"She thanked us."}` → 200.
9. `PATCH` `{"status":"open"}` → open again, closing details cleared, notes kept.
10. Fence checks: signed out → 401 on every route; a second business's token → 404 on the first one's ticket, contact and owner ids; role `staff`
    and role `staff_own` can both read, add, assign, note and close every ticket; a made-up contact or owner id → 404.
11. Activity log (database): one line per action (`tickets.created`, `tickets.updated`, `tickets.note_added`, `tickets.closed`, `tickets.reopened`), with
    field names only; no title, note or name.

## Reused from the hotel agent
The "Port from" table has no row for F14. The hotel agent's tickets are tied to bookings and locations, so nothing is ported. What is reused is the idea (a ticket linked to an inbox message, which F15 will do).
