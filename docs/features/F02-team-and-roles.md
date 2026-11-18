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
2. `POST /auth/invitations/preview` (a POST so the token is never in a logged address), `POST /auth/accept-invitation`: the accept page.
3. `PATCH /team/members/{id}` (role, pause/add back), `DELETE /team/members/{id}` (remove with hand-over).
4. `DELETE /team/invitations/{id}` (cancel), `POST /team/invitations/{id}/resend`.
5. `POST /teams`, `GET /teams` (teams and their members).
6. `PATCH /teams/{id}`, `DELETE /teams/{id}`.
7. `GET /audit-log` and Settings → Activity; role-aware Settings menu.

## Slice log

**Slice 1 (built):** `POST /team/invitations`, `GET /team` (managers only). Migration `053_invitations.sql` (table `invitations`, only a hash of the link stored, one open invitation per email per business, 48-hour link). Files: `auth/repositories/invitations.repository.ts`, `auth/services/team.service.ts`, `auth/routes/team.routes.ts`, `auth/helpers/invitation-email.ts`, `packages/shared/src/team.ts`. Web: Settings → Team (`features/team/TeamPage.tsx`, `InviteMemberPanel.tsx`, `team-state.ts`); the Team tab shows for managers only. Tests: `team.test.ts` (9), isolation entries, `team-state.test.ts`, `e2e/team.spec.ts` (7 at phone and desktop).

**Slice 2 (built):** `POST /auth/invitations/preview`, `POST /auth/accept-invitation` (public, limited to 10 a minute, listed in `public-routes.ts` with reasons). Files: `auth/services/invitation-accept.service.ts`, `auth/routes/invitation-accept.routes.ts`, `findOpenInvitationByTokenHash` and `markInvitationAccepted` in the invitations repository. One transaction on the owner connection: checks the link, the password and that the email is still free, uses the link up in one statement (two requests at once: one wins), creates the user with the invited role in the inviting business, stores the password hash, counts the email as verified, writes the log line. A refused weak password rolls everything back, so the link still works. Web: `pages/AcceptInvitationPage.tsx` at `/accept-invitation?token=`. Tests: `team-accept-invitation.test.ts` (11), `e2e/accept-invitation.spec.ts` (4 at phone and desktop).

**Slice 3 (built):** `PATCH /team/members/{id}` (change role, or `status: 'active'` to add a removed person back) and `DELETE /team/members/{id}?hand_over_to=` (remove). Rules: the business always keeps one active manager (managers are locked `FOR UPDATE` before any change, so two at once take turns); nobody removes themselves; a removed person's role is not changed until they are added back; removing someone already removed does nothing; the hand-over person must be an active person of the business (404 for another business's id, 400 for a removed person or the same person), and is the removing manager when left out. Removing sets `status = 'disabled'` (the sign-in check refuses them at once), ends their sessions, and publishes `team.member_removed` (ids only: `userId`, `handOverToUserId`, `removedBy`). Four modules listen and move the open work: leads (open leads, and the sharing-out rule: the one person or fallback, and the round-robin list), tasks (open tasks), tickets (open tickets), offerings (their owner). Each writes one activity log line (`leads.handed_over`, …) and is safe to run twice. Web: a "…" menu on each person (not on your own row) with Make <role>, Remove from the team (an "Are you sure?" box naming the person, with a "Hand their open work to" list) and Add back. Tests: `team-members.test.ts` (15), isolation entries, e2e (5 more specs at phone and desktop).

**Slice 4 (built):** `DELETE /team/invitations/{id}` (cancel) and `POST /team/invitations/{id}/resend` (a new link; the old one stops; also revives an expired invitation; limited to 10 per 10 minutes). Web: a "…" menu on each waiting invitation (Send again, Cancel invitation with an "Are you sure?" naming the person). Tests: `team-invitations-manage.test.ts` (9), isolation entries, e2e (2 more specs).
