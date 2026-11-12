# F14: Tickets

**Requirements:** `4-staff-workspace/06-tickets.md`; `requirements/API.md` (Tickets); docs/CONVERSATION-TYPES.md; docs/plan/PHASE-1.md (F14)
**Depends on:** F00, F01, F04      **Module:** `core.tickets` (core: always on, no switch; requires `core.contacts`)
**Status:** in progress. Owner said "continue" on 12 Nov 2026 = go, with my four defaults (many notes; everyone sees all tickets; any staff can assign, close and reopen; unassigned allowed).

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
  activity-log lines and events (`ticket.created`, `ticket.assigned`, `ticket.closed`, `ticket.reopened`) so F23 can alert and
  F07 can show them on the timeline; the open-ticket count on the contact summary.
- Out: the screens (designer, as for F01, F03, F04, F06); the AI's "raise a ticket" tool (F19); the router (F15); alerts
  (F23); replying on the customer's channel, ticket stages, response targets (Phase 3).

## Rules (proposed)
- `type`: `callback`, `question`, `complaint`, `existing_customer`, `other`. `priority`: `low`, `normal`, `high`, `urgent`
  (default `normal`; the router sets `high` for complaints later). `status`: `open` or `done`.
- Every ticket belongs to one contact of the same business (another business's contact answers 404).
- The owner must be a person of the same business (composite foreign key to users, as for leads); otherwise 404.
- Closing needs no note, but the screen will ask for one; a note sent with the close is saved as a note.
- Closing sets `closed_at` and who closed it; reopening clears them. Each is an event and an activity-log line.
- The optional `conversation_type_key` (text) records which conversation type raised it; unused until F15.
- Money is not involved. Dates are UTC. Activity-log lines and events carry **ids and field names only**.
- Another business's ticket answers 404; a wrong role answers 403.

## Routes (4, built two at a time)
| Method | Address | What it does | Who |
| --- | --- | --- | --- |
| POST | `/tickets` | Add a ticket for a contact | Staff |
| GET | `/tickets/{id}` | One ticket with its notes | Staff |
| GET | `/tickets` | List; filters: status, owner (`me`, a person, `unassigned`), type, priority, contact | Staff |
| PATCH | `/tickets/{id}` | Assign, change type or priority, add a note, close or reopen | Staff |

## Slice plan (each at most 2 routes; you test each in Postman before the next)
| Slice | What | Routes |
| --- | --- | --- |
| 0 | Migration `013_tickets.sql` (tickets, ticket_notes, forced RLS, composite foreign keys, no DELETE), table types, shared zod schemas, empty module `core.tickets` registered | none |
| 1 | Add a ticket and read one | `POST /tickets`, `GET /tickets/{id}` |
| 2 | The list with filters and paging | `GET /tickets` |
| 3 | `PATCH`: assign, change type and priority | `PATCH /tickets/{id}` (part 1) |
| 4 | `PATCH`: add a note, close, reopen | `PATCH /tickets/{id}` (part 2) |
| 5 | Open-ticket count on the contact summary; journey tests; `api-security` review; hand-off with the manual test script and a Postman collection | none |

## Reused from the hotel agent
The "Port from" table has no row for F14. The hotel agent's tickets are tied to bookings and locations, so nothing is ported. What is reused is the idea (a ticket linked to an inbox message, which F15 will do).

## Security checklist (to fill in at hand-off)
Account fence on every query; account never from input; 401, 403, 404 (other business), 400 for every route; owner and
contact checked inside the same business; no personal data in logs or events; isolation tests.
