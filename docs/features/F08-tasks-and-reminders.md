# F08: Tasks and reminders

**Requirements:** `2-crm-core/05-tasks-and-reminders.md`; `requirements/API.md` (Tasks and reminders); the designer's activity menu (Create Task, Create Meeting, Create Call) in the Leads list frame `docs/design/screens/leads-list-with-activity-menu.png`.
**Depends on:** F04 contacts, F06 leads, F07 timeline.      **Module:** `core.tasks` (core).
**Status:** `in_progress`: slices 1 to 3 built (17 Nov 2026).

## Feature guide

**What it does.** A task is a to-do with one owner and a due time: "Call Priya at 9 AM", "Send Rahul the brochure". Staff add tasks from the Tasks page, from a lead's row (the activity icon, Create Task) or from the lead's own page. The Tasks page has four tabs with their numbers: Overdue, Today, Upcoming and Done.

**Why it is useful.** A promise to call back that nobody keeps is worse than no promise. A task makes every promise one person's job, with a time. Later the AI agent adds a task for every promise it makes, so a callback promised at midnight is still on someone's list at nine.

**A day in the life.** Priya's lead is called back at 9. Front desk presses the activity icon on her row, chooses Create Task, types "Call Priya about the December quote" and a time, and saves. At 8:45 the owner gets a reminder email; if it is still open at 9:15 the managers hear it is late. The owner ticks it done and the timeline shows it.

**Who can do what.**
- Managers and staff add tasks (for themselves, or for a colleague), and see everyone's tasks or just their own.
- The "own leads only" role adds tasks only on its own leads and for itself, and sees only the tasks it owns.

**Settings and limits.** A title is 1 to 200 characters. "Today" means the business's day in its own time zone (not UTC). The reminder goes out 15 minutes before a task is due and the late alert 15 minutes after it, per business (the numbers are stored per business; the Settings screen for them comes later).

**What it never does.** It never shows another business's tasks. It never keeps a task's words in the activity log or in events (ids only).

**Not part of it (yet).** Handing a task to a colleague from the screens (the API does it; the screen waits for the team list of F02); asking whether to close open tasks when a lead is won or lost, and tasks on the timeline (slice 4); Create Meeting and Create Call in the activity menu (later phases, they are not drawn dead).

### For the tech team
- **Module:** `core.tasks` (requires `core.auth`, `core.contacts`, `core.leads`). Table `tasks` (migration 050): kind `call | whatsapp | email | todo`, `due_at`, `owner_user_id`, `done_at`, `created_by_agent`, `reminded_at`, `overdue_alerted_at`, `deleted_at`. Composite keys keep a task, its lead and its owner in one business.
- **Routes:** `POST /tasks`, `GET /tasks?due=&owner=&lead_id=&contact_id=` (slice 1); `PATCH /tasks/{id}`, `DELETE /tasks/{id}` (slice 2).
- **The tab is never stored.** `helpers/day-bounds.ts` works it out from the due time and the business's time zone (overdue = open and past; today = open and due before tomorrow starts; upcoming = after; done). The four tab numbers come back with every list in one query.
- **Events:** publishes `task.created` (ids and kind only).

## Slices
| # | Slice | Routes |
| --- | --- | --- |
| 1 | Add a task, list tasks by tab; Tasks page, Add task form, Create Task in the lead row, tasks on the lead page | 2 |
| 2 | Complete, snooze, reassign, edit, delete (`PATCH /tasks/{id}`, `DELETE /tasks/{id}`) with "Are you sure?" | 2 |
| 3 | Reminder before and late alert after (jobs, no routes; notifications provider console/email now) | 0 |
| 4 | Ask about open tasks when a lead is Won or Lost; tasks on the timeline; the AI's tasks; hand-over on removing a person (F02) | 0 |

## Decisions
- Tabs are disjoint: a task is in exactly one of Overdue, Today, Upcoming, Done (Today means due from now to the end of the business's day).
- The owner is the signed-in person unless another person of the business is named; the "own leads only" role may only name itself.
- Create Meeting and Create Call are not drawn in the menu until they work.

## Build log

### Slice 1: add a task, list tasks (built 17 Nov 2026)
- **Routes (2):** `POST /tasks` (body: exactly one of `leadId` or `contactId`, `title`, `dueAt` with an offset, optional `kind` and `ownerUserId`; 201 with the task, its person, its owner and its tab) and `GET /tasks` (`due` picks a tab, `owner=me` or a person, `lead_id` or `contact_id`, `page`, `limit`; answers the items, the total and the four tab numbers). 404 for an unknown or another business's lead, person or owner; 403 for the "own leads only" role asking for a whole person, someone else's tasks, or handing a task to someone else; 400 for bad input.
- **Data:** migration `050_tasks.sql` (table, indexes, RLS, grants: insert, and update only of what the next slice changes; no delete).
- **Screens:** the Tasks page (tabs with numbers in the designer's segmented control, Filter for Everyone / Mine, Add task, table or cards, paging, loading / error / empty states), the Add task side panel (person search or the given lead, kind, words, due date and time typed in the business's time zone), the activity icon in a lead's row now opens a menu with Create Task, and a Tasks card on the lead page.
- **Tests:** 11 API tests (`test/tasks.test.ts`), isolation entries for both routes, 9 tests for the day and tab rules, 11 web rule tests (time zone conversion, the form, the view) and 10 browser specs (`e2e/tasks.spec.ts`, pretend API `e2e/pretend-tasks.ts`).
- **Found by the tests:** "next whole hour" was counted in UTC hours, wrong for India (half-hour zone); it is counted on the wall clock now.

### Slice 2: tick off, snooze, edit, hand over, delete (built 17 Nov 2026)
- **Routes (2):** `PATCH /tasks/{id}` (any of `title`, `kind`, `dueAt`, `done`, `ownerUserId`; at least one; sending what the task already has changes nothing and writes nothing; a new due time is how a task is snoozed and clears the reminder and late-alert marks so both fire again; the row is locked first so two changes take turns) and `DELETE /tasks/{id}` (a soft delete). The "own leads only" role can change or delete only tasks it owns (another's answers 404) and cannot hand a task to anyone else (403). 404 for unknown, deleted or another business's task, or an owner who is not in the business; 400 for bad input.
- **Log and events:** `tasks.updated` (which fields, never the words) with `task.updated`, plus `task.completed`, `task.reopened` or `task.reassigned` when those happened; `tasks.deleted` with `task.deleted`. Ids only.
- **Screens:** a tick box on every task (ticking moves it to Done; ticking a done task opens it again), a "…" menu on every task with Edit, Snooze (In 1 hour, Tomorrow morning, Next week: 9:00 on the business's clock, next Monday) and Delete ("Delete the task “…”?" naming it), the Add task panel doubling as the Edit form (sends only what changed), on the Tasks page and in the lead page's Tasks card. A refusal is said in plain words.
- **Decision:** reassigning has no button yet because there is no team list to choose from until F02; the API is ready and tested.
- **Found by the tests:** saving an edit that only changed the words would also have sent the due time, shifted by its dropped seconds; the form now sends the due time only when the date or time box really changed.
- **Tests:** 12 more API tests (tick and reopen with log and events without the words, snooze clears the marks, edit and hand over, no-op writes nothing, 400s, 404s and 401, own-leads-only role, soft delete with log and event, delete refusals), isolation entries for both routes, 7 more web rule tests (snooze moments in the business time zone, editing) and 10 more browser specs.

### Slice 3: reminders and late alerts (built 17 Nov 2026)
- **Routes: none** (background jobs). Migration `051_accounts_task_alert_minutes.sql`: `task_reminder_minutes` and `task_late_alert_minutes` on the business (both 15, 1 to 1440). No screen changes them yet (it joins the business settings later); until then every business gets 15.
- **Jobs:** `tasks.send_alerts` runs by itself every minute and queues `tasks.send_alerts_for_business` for each business. That job, in the business's fence: emails the **owner** of every open task that is due within the reminder minutes and not yet reminded; emails every **manager with a confirmed address** for every open task that is at least the late-alert minutes late and not yet alerted. Each task is reminded once and alerted once per due time (snoozing clears both marks). A task more than a day late stays quiet (not news). Done and deleted tasks never alert.
- **Safety:** the email goes out first and the task is marked afterwards, so a failed send is tried again the next minute; a task nobody can be told about (no confirmed address) is marked anyway so it is not checked every minute. Only confirmed email addresses are used. The words in the email are escaped, so staff-written text can never become HTML. One log line (`tasks.reminder_sent`, `tasks.late_alert_sent`) and one event (`task.reminder_sent`, `task.late_alerted`) per alert: ids only, never the words or the address.
- **Channel:** email only for now (console in development, a real mail server in production). WhatsApp reminders arrive with F25 (the requirement's "better than HubSpot"), through the same two emails' words.
- **Tests:** 9 API tests in `test/task-alerts.test.ts` with a recording mail sender and a chosen "now" (once only, the default and custom minutes, quiet for far/done/deleted/past tasks, mail failure then retry, unreachable owner marked, managers only with confirmed addresses, 15 minutes of waiting, a day-old task quiet, snooze clears the marks, businesses never mix) and 7 tests of the email words (including that staff words are escaped).
