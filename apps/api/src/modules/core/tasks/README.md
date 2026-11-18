# core.tasks: tasks and reminders

Built in slices of at most 2 API routes (see `docs/features/F08-tasks-and-reminders.md`).

| Folder               | What is in it                                                                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`            | `tasks.routes.ts`: `POST /tasks`, `GET /tasks`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}`                                                                                     |
| `services/`          | `tasks.service.ts`: add, list one tab with the tab numbers, change (done, snooze, reassign, edit) and soft-delete, with log and events                                        |
| `services/` (alerts) | `task-alerts.service.ts`: the reminders and late alerts of one business (called by the minute job in `module.ts`)                                                             |
| `repositories/`      | `tasks.repository.ts`: the SQL for `tasks`                                                                                                                                    |
| `helpers/`           | `alert-emails.ts`: the words of the reminder and late-alert emails (pure); `day-bounds.ts`: where "today" ends in the business's time zone, and which tab a task is in (pure) |

A task is about a person and usually one of their leads, has one owner and a due time. The tab (Overdue, Today, Upcoming, Done) is
worked out from the due time and the business's time zone every time, never stored. The "own leads only" role sees only the tasks it owns.

Reads the lead (leads `findLeadReference`), the person (contacts `findContactSummaries`), the owner's name and the business's time zone
(auth `findPeopleSummaries`, `findBusinessIdentity`), always through those modules' `index.ts`.

Events published (ids only, never the title): `task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.reassigned`, `task.deleted`.

Jobs: `tasks.send_alerts` (every minute, queues one job per business) and `tasks.send_alerts_for_business` (reminder before a task is due to its owner, late alert after to the managers; email only for now). Events: `task.reminder_sent`, `task.late_alerted`.

Other modules reach it only through `index.ts`: `findTaskSummary` (the activities module reads a task's words to write its timeline line). Events published also: `task.created` carries `createdBy`, `task.updated` and `task.completed` carry `by` (who).
