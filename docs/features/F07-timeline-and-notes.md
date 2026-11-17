# F07: Timeline and notes

**Requirements:** `2-crm-core/04-activity-timeline-and-notes.md`; `requirements/API.md` (Activity timeline and notes); the designer's frames `docs/design/screens/leads-note-panel.png` ("Leads - Note", Figma node 2024:3774) and `docs/design/screens/leads-list-with-activity-menu.png` (Figma node 2024:2730).
**Depends on:** F04 contacts, F06 leads.      **Module:** `core.activities` (core).
**Status:** `in_progress`: slice 1 built (17 Nov 2026). Pulled ahead of F02 because the designer delivered the screen and the owner asked for it (R69, 17 Nov 2026).

## What the designer drew (17 Nov 2026, new)
- **Notes panel** (a side panel, "Leads - Note"): a title "Notes" with a count badge; the lead's name under it; a sort "Recent Last"; the list of notes, each with the writer's round initials, their name, their role, how long ago, and the note in a bubble; a text box "Enter here"; an attach (paperclip) button; Cancel and Save. Opened from the **add-note icon** in a lead's row (and on the lead page).
- **Next activity column:** the date chip ("Nov 22") now has a small **notes icon** beside it when the lead has notes.
- **Activity icon menu** (the pulse icon in a lead's row): **Create Task, Create Meeting, Create Call** (these belong to tasks, F08, and later phases; today the icon is drawn and does nothing).

## Slices (at most 2 routes each, owner rule)
| # | Slice | Routes |
| --- | --- | --- |
| 1 | Notes on a lead: migration `activities`, `POST /notes`, `GET /activities?lead_id=`, the Notes panel (row icon and lead page) | 2 |
| 2 | Edit your own note, delete a note (manager, "Are you sure?"): `PATCH /notes/{id}`, `DELETE /notes/{id}` | 2 |
| 3 | The notes icon in the Next activity column, and notes on the contact page (a contact's timeline shows all its leads) | 0 to 1 |
| 4 | Stage changes and lead creation written as timeline lines through events; filter chips (notes, stage changes, ...) | 0 |

## Decisions to make while building (recorded in the brief when built)
- The writer's name and role come from the sign-in module through its `index.ts` (a small F02-lite); the job title ("Front desk manager" in the Figma) does not exist yet, so the role (Manager or Staff) is shown.
- The attach button is not built (no attachments in the requirements); it is left out rather than drawn dead.
- "Meeting" and "Call" in the activity menu need later features; the menu is built with F08 (Create Task first).

## Build log

### Slice 1: notes on a lead (built 17 Nov 2026)
- **Routes (2):** `POST /notes` (staff and managers; body: `body` and exactly one of `leadId` or `contactId`; 201 with the note and who wrote it) and `GET /activities?lead_id=` or `?contact_id=` (exactly one, else 400 `FILTER_NEEDED`; newest first; `kind`, `page`, `limit`). A person's timeline includes the notes on all their leads. The "own leads only" role can use only its own leads' notes (403 for a person's timeline or a note on a person; 404 for a lead that is not theirs).
- **Data:** migration `048_activities.sql`: `activities` (RLS, composite keys so a note's lead and writer are of the same business, grants: insert, and update only of the words and the edited/deleted marks, no delete), and a `(account_id, id)` unique key on `leads`.
- **Cross-module:** the lead is checked through `leads/index.ts` (`findLeadReference`), the person through `contacts/index.ts`, and the writer's name and role through `auth/index.ts` (`findPeopleSummaries`).
- **Log and events:** one log line (`activities.note_added`, never the words) and the `note.added` event with ids only.
- **Screens (from the designer's frames):** the Notes panel (title and count, "@lead name", sort Recent last / Recent first, avatar initials, name, role, "1 hr. ago", bubble, text box, Cancel and Save) opened from the add-note icon in a lead's row; the same notes on the lead page (the Timeline card). **Column move (Figma):** "Next activity" is now the first column, right after the select box (date chip, and the hover icons: Log an activity does nothing yet, Add note works).
- **Tests:** 12 API tests (`test/activities.test.ts`: adds a note with writer and role, log and event without the words, note on a person, 400s, 404s including another business, 401, roles, timelines by lead and by person, paging, writers, deleted notes hidden), isolation entries for both routes, 11 web tests, and browser specs (`e2e/notes.spec.ts`, with a pretend notes API).
- **Not built yet:** the notes icon beside the date chip when a lead has notes (slice 3, needs the note count), editing and deleting notes (slice 2), stage changes on the timeline (slice 4), the attach button (not in the requirements), the Create Task / Meeting / Call menu (F08).
