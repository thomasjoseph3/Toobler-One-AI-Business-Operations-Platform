# F07: Timeline and notes

**Requirements:** `2-crm-core/04-activity-timeline-and-notes.md`; `requirements/API.md` (Activity timeline and notes); the designer's frames `docs/design/screens/leads-note-panel.png` ("Leads - Note", Figma node 2024:3774) and `docs/design/screens/leads-list-with-activity-menu.png` (Figma node 2024:2730).
**Depends on:** F04 contacts, F06 leads.      **Module:** `core.activities` (core).
**Status:** `in_progress`: slices 1, 2 and 3 built (17 Nov 2026). Pulled ahead of F02 because the designer delivered the screen and the owner asked for it (R69, 17 Nov 2026).

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

### Slice 2: edit your own note, delete a note (built 17 Nov 2026)
- **Routes (2):** `PATCH /notes/{id}` (body: the new words; only the writer may, 403 for anyone else, including a manager and for an agent's note; sending the same words changes nothing and writes nothing; the note is marked edited; the "own leads only" role can change its own note only while the lead is still its own, else 404) and `DELETE /notes/{id}` (managers only, 403 to staff; a soft delete: the note leaves every timeline, its row is kept; 404 for an unknown, already deleted or another business's note).
- **Log and events:** `activities.note_edited` and `note.edited`, `activities.note_deleted` and `note.deleted`: ids only, never the words. The edit locks the note's row first, so two changes at the same moment take turns.
- **Screens:** under each note, the writer sees **Edit** (the words change in place with Save changes and Cancel; Edited shows afterwards) and a manager sees **Delete** (asks "Delete the note by <writer>?" naming the writer). A refusal is shown in plain words. Works in the Notes panel and on the lead page.
- **Tests:** 9 more API tests (edit own with log and event, same words change nothing, 403 for someone else's note even to a manager, 404s, 400s, 401, own-leads-only role, manager delete is soft and logged, 404/403/401/400 on delete), isolation entries (B cannot edit or delete A's note), web rule tests, and 4 more browser specs.
- **Decision (to confirm):** a manager cannot change someone else's note, only delete it (the requirement says edit by the writer, delete by a manager).

### Slice 3: the orange notes icon and the notes on the contact page (built 17 Nov 2026)
- **Route (1):** `GET /activities/counts?lead_ids=a,b,c` (1 to 100 ids; staff and managers). Answers `{ counts: { <leadId>: <number> } }` with a number for every lead asked about, 0 for none. A lead the person cannot see (unknown, deleted, another business's, or, for the "own leads only" role, not theirs) counts 0, so asking tells nothing. Deleted notes are not counted. The leads module gives the visible ids through its `index.ts` (`findVisibleLeadIds`); the leads list itself is unchanged (no cross-module join).
- **Screens:** on the Leads list a lead that has notes shows the small orange notes icon beside the date chip **all the time** (Figma), not only on hover; it opens the Notes panel, and its name says how many ("Notes for Priya: 3"). A lead without notes still shows the add-note icon only on hover. The counts are asked once for the leads on the page and again after a note is added, changed or deleted. On a contact's page the placeholder Timeline card is now a Notes card: every note on the person and on all their leads, newest first, with a box to write a note on the person (`POST /notes` with `contactId`); it is not shown to the "own leads only" role.
- **Fix found on the way:** closing a dialog inside a dialog (the "Are you sure?" over the Notes panel) also closed the outer one. `Dialog` and `SidePanel` now react only to their own close event.
- **Tests:** 4 API tests for the counts (counts and deleted notes, 0 for others' leads, own-leads-only role, 400s and 401), an isolation entry, 3 web rule tests, and 2 browser specs (icon follows adding and deleting; contact page notes).
