---
name: f08-tasks-and-reminders
description: F08 tasks status (17 Nov 2026): slices 1-4 done and approved under the standing instruction; AI-promise-to-task still open; F02 is next
metadata:
  type: project
---

**State (17 Nov 2026):** F07 and F08 are both marked `approved` in `docs/plan/STATUS.md` under [[autonomous-slices-phase-one]] (owner has not tested by hand). Branch `feature/F31-setup-wizard`, local commits only. F08 commits: slice 1 f89d05d, 2 d649c67, 3 dcaaa89, 4 2b17776 (plus the final status commit). Brief: `docs/features/F08-tasks-and-reminders.md`.

**Built:** migrations 050 tasks, 051 accounts task_reminder/late_alert minutes (both 15, no screen yet), 052 task timeline kinds. Routes POST/GET /tasks, PATCH/DELETE /tasks/{id}. Module `core.tasks` (`helpers/day-bounds.ts` tabs in the business time zone; `services/task-alerts.service.ts` + jobs `tasks.send_alerts`/`tasks.send_alerts_for_business`, email only). Web `features/tasks/` (TasksPage, TaskFormPanel add+edit, useTaskActions, LeadTasksCard), Create Task in the lead row activity icon (ActionMenu got `triggerIcon`), open-tasks question when a lead is Won/Lost (in `useLeadActions`), Tasks chip on timelines. Full suites after slice 4: 2475 unit/API, 512 e2e green.

**Open:** AI agent promises -> one task each (needs the agent's stored promise, `agents/helpers/agent-conversation-state.ts` ChosenPromise; do as its own slice); reassign button waits for F02 team list; WhatsApp reminders F25; Create Meeting/Call later.

**Next:** F02 (team, roles, teams, invitations, audit log; req `1-foundation/02-users-roles-and-teams.md`, `04-security-privacy-and-audit.md`): write brief first, set it in_progress in STATUS (gate needs the brief file to exist), then slices of max 2 routes. Then F05, F09-F13, F21-F30, F32-F36.
**Gotchas learned:** e2e pages render both table and cards (use `.locator('visible=true')`/exact names); Prettier reflows imports so scripted text replaces on them fail; event payloads must never hold business words (tests enforce) so handlers read words via another module's index.ts.
