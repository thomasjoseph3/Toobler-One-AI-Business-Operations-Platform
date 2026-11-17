# F07: Timeline and notes

**Requirements:** `2-crm-core/04-activity-timeline-and-notes.md`; `requirements/API.md` (Activity timeline and notes); the designer's frames `docs/design/screens/leads-note-panel.png` ("Leads - Note", Figma node 2024:3774) and `docs/design/screens/leads-list-with-activity-menu.png` (Figma node 2024:2730).
**Depends on:** F04 contacts, F06 leads.      **Module:** `core.activities` (core).
**Status:** `planned`. Pulled ahead of F02 because the designer delivered the screen and the owner asked for it (R69, 17 Nov 2026).

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
