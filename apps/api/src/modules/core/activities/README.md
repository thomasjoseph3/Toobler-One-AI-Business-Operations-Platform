# core.activities: the timeline and notes

Built in slices of at most 2 API routes (see `docs/features/F07-timeline-and-notes.md`).

| Folder          | What is in it                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `routes/`       | `activities.routes.ts`: `POST /notes`, `GET /activities`                                                                 |
| `services/`     | `activities.service.ts`: add a note to a lead or a person, list a lead's or a person's timeline, with the log and events |
| `repositories/` | `activities.repository.ts`: the SQL for `activities`                                                                     |

One row of `activities` is one thing that happened with a person and, usually, one of their leads. Today the only kind is `note`.
A note on a lead also stores the lead's contact, so a person's timeline is every row with that contact (all their leads). The
"own leads only" role can use only its own leads' timelines (a person's whole timeline would show other people's leads: 403).

It reads the lead (the leads module's `findLeadReference`), the person (the contacts module's `findContactSummaries`) and the
writer's name and role (the sign-in module's `findPeopleSummaries`), always through those modules' `index.ts`.

Events published (ids only, never the words): `note.added`. Later slices add editing and deleting, and the events that write stage
changes and other lines to the timeline.
