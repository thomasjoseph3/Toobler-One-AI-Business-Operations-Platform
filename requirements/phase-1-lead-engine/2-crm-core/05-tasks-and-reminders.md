# Tasks and reminders

**Phase 1 · CRM core · HubSpot equivalent: Tasks, Task queues, Reminders**

## What it is

A task is a to-do with an owner and a due time: "Call Priya at 9 AM", "Send Rahul the brochure". The AI creates a task
whenever it promises something. Staff create their own too.

## Why it matters

A promise to call back that nobody keeps is worse than no promise. Tasks make every promise someone's job, with a time.

## How it works

1. At 11 PM the AI tells Priya "Someone will call you at 9 AM." It creates a task "Call Priya" due 9 AM, given to the
   lead's owner.
2. At 8:45 AM the owner gets a WhatsApp reminder.
3. At 9:15 AM, if the task isn't done, the manager gets an alert that it's late.
4. The owner calls, ticks the task done, and the timeline shows it.

**Task kinds:** Call, WhatsApp, Email, To-do.

## Rules

- Every AI promise creates exactly one task.
- A task belongs to a contact or a lead, and to one owner.
- When a lead is Won or Lost, its open tasks ask whether to close them.

## Screens

- **Tasks page:** Overdue, Today, Upcoming, Done; filter by owner; tick to complete; snooze.
- **On contact and lead pages:** their tasks, Add task.
- **Today page:** my tasks due today (see [Today](../4-staff-workspace/01-today-page.md)).

## Done when

- [ ] Each callback the AI promises becomes a task with the right due time and owner.
- [ ] Owners get a reminder 15 minutes before; managers get an alert when it's 15 minutes late (both times set per
      business).
- [ ] Staff can add, complete, snooze and reassign tasks.

## Better than HubSpot

- Tasks are created by the AI from its own promises, so nothing said on a call at midnight is forgotten.
- Reminders arrive on WhatsApp, not only inside the app.

## For developers

- **Code folder:** `apps/api/src/core/tasks`
- **API:** [API.md](../../API.md), Phase 1 → Tasks and reminders
- **Table:** `tasks` (`account_id`, `contact_id`, `lead_id`, `kind`, `title`, `due_at`, `owner_user_id`, `done_at`,
  `created_by_agent`, `reminded_at`, `overdue_alerted_at`). 
