# core.tickets: requests that are not sales

Built in slices of at most 2 API routes (see `docs/features/F14-tickets.md`).

| Folder | What is in it |
| --- | --- |
| `routes/` | `tickets.routes.ts`: `POST /tickets`, `GET /tickets`, `GET /tickets/{id}`, `PATCH /tickets/{id}` |
| `services/` | `tickets.service.ts`: add a ticket, list with filters, read one with its notes, and change one (assign, edit, add a note, close, reopen), with the activity log and events |
| `repositories/` | `tickets.repository.ts`: the SQL for `tickets` and `ticket_notes` |
| `helpers/` | `actor-stamp.ts`: reads "which person" out of a stored actor stamp (pure) |

A ticket belongs to one contact. It is `open` until someone closes it (`done`); a closed ticket can be reopened. Its owner
(optional) must work for the same business. Notes are written once and never edited. Tickets are shared work: every role of the
business sees every ticket. Tickets never touch the leads board or a contact's lifecycle stage.

Events published (ids and field names only): `ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.note_added`,
`ticket.closed`, `ticket.reopened`. Alerts (F23) and the timeline (F07) will listen to them. The router (F15) and the AI agent (F19)
will raise tickets later by calling the same service through this module's `index.ts` (nothing is exported yet).
