---
name: f02-team-and-roles
description: F02 team, invitations, teams, activity log built 18 Nov 2026 in 7 slices (commits d159747..64c4694); decisions R70-R73; what is left
metadata:
  type: project
---

F02 (team, roles, teams, activity log) was built on branch `feature/F31-setup-wizard` on 18 Nov 2026 in 7 slices under the standing instruction [[autonomous-slices-phase-one]].

**What exists:** `POST/GET /team…` invitations (migration 053, 48 h single-use link, only a hash stored), public `POST /auth/invitations/preview` and `/auth/accept-invitation` (token in the body), `PATCH/DELETE /team/members/{id}` (role, add back, remove with hand-over by event `team.member_removed` handled in leads, tasks, tickets, offerings), teams (migration 054; `GET/POST /teams`, `PATCH/DELETE /teams/{id}`), `GET /audit-log`. Web: Settings tabs Team, Teams, Activity (managers only), accept page `/accept-invitation`.

**Why:** a manager can bring staff in and remove them safely; one email = one business (R70), WhatsApp invites wait for F25 (R71, Copy link covers it), removal = disabled, can be added back (R72), smaller choices R73. Brief: `docs/features/F02-team-and-roles.md`.

**How to apply:** all code lives in `core.auth` (it owns users). Test helper `addTeamMember` in `apps/api/test/support/team.ts` still inserts straight into the DB (fine). Open follow-ups: reassign UI on lead/task screens (needs the colleague list: `GET /team` is manager-only, `GET /teams` is open), WhatsApp invite with F25.

**Next:** F05 companies, then F09 custom fields, F10, F11, F12, F13, F21-F30, F32-F36. Run e2e with `E2E_WEB_PORT=3917`.
