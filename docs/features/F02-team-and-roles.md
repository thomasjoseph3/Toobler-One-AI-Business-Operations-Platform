# F02: Team, roles, teams and the activity log

**Requirements:** `1-foundation/02-users-roles-and-teams.md`, `1-foundation/04-security-privacy-and-audit.md` (activity log part); docs/ROLES-AND-ACCESS.md; docs/SECURITY.md.
**Depends on:** F01 sign-in.      **Module:** `core.auth` (people, invitations, teams all live in the sign-in module: it owns the `users` table).
**Status:** `in_progress` under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

*(Written in full at the end of the last slice. Plan below.)*

**In plain words:** the manager invites staff by email, the staff member opens the link and chooses a password, and the manager can then change their role, put them in teams, pause them, or remove them (their open leads and tasks go to someone the manager picks). Settings → Activity shows who did what.

## Decisions (recorded in docs/REQUIREMENTS-REVIEW.md as R68 to R71)

- **R68, one email, one business (kept).** The requirement says one person may work for several businesses and switch. The owner decided on 10 Nov 2026 that one email belongs to one business for now, so the business switcher is **not built**. Invited emails that already have an account are refused.
- **R69, invitations by email now, WhatsApp with F25.** The invitation also has a **copy link** button so a manager can send it on WhatsApp by hand today. The automatic WhatsApp message arrives with the WhatsApp channel (F25).
- **R70, remove means pause for good.** A removed person is set to `disabled` (their sessions end at once, they cannot sign in). The row is kept because their notes, tasks and the activity log point at them. A manager can add them back. Their email stays taken.
- **R71, hand-over by event.** Removing a person publishes `team.member_removed`; the leads and tasks modules each move that person's open items to the person the manager chose. (Events, not direct calls, so auth does not import leads or tasks.)
- Rules: at least one active manager always (changing or removing the last manager answers 409); a manager cannot remove themselves.
- "Own leads only" staff role is kept (it already exists and is enforced by leads and tasks).

## Slice plan (at most 2 routes each)

1. `POST /team/invitations`, `GET /team`: Settings → Team (list, invite).
2. `GET /auth/invitations/{token}`, `POST /auth/accept-invitation`: the accept page.
3. `PATCH /team/members/{id}` (role, pause/add back), `DELETE /team/members/{id}` (remove with hand-over).
4. `DELETE /team/invitations/{id}` (cancel), `POST /team/invitations/{id}/resend`.
5. `POST /teams`, `GET /teams` (teams and their members).
6. `PATCH /teams/{id}`, `DELETE /teams/{id}`.
7. `GET /audit-log` and Settings → Activity; role-aware Settings menu.

## Slice log

**Slice 1 (built):** `POST /team/invitations`, `GET /team` (managers only). Migration `053_invitations.sql` (table `invitations`, only a hash of the link stored, one open invitation per email per business, 48-hour link). Files: `auth/repositories/invitations.repository.ts`, `auth/services/team.service.ts`, `auth/routes/team.routes.ts`, `auth/helpers/invitation-email.ts`, `packages/shared/src/team.ts`. Web: Settings → Team (`features/team/TeamPage.tsx`, `InviteMemberPanel.tsx`, `team-state.ts`); the Team tab shows for managers only. Tests: `team.test.ts` (9), isolation entries, `team-state.test.ts`, `e2e/team.spec.ts` (7 at phone and desktop).
