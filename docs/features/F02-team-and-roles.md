# F02: Team, roles, teams and the activity log

**Requirements:** `1-foundation/02-users-roles-and-teams.md`, `1-foundation/04-security-privacy-and-audit.md` (activity log part); docs/ROLES-AND-ACCESS.md; docs/SECURITY.md.
**Depends on:** F01 sign-in.      **Module:** `core.auth` (people, invitations, teams all live in the sign-in module: it owns the `users` table).
**Status:** `approved` (18 Nov 2026) under the owner's standing instruction (17 Nov 2026) after `npm run verify` passed; built in 7 slices of at most 2 routes. The owner has not tested it by hand yet.

## Feature guide

**What it does.** A manager brings their staff into the business. They type a person's name, email and (if they like) mobile number, pick a role, and press **Send invitation**. The person gets an email with a link, opens it, chooses a password, and is in. From then on the manager can change their role, put them in teams like "Sales" or "Front office", or remove them when they leave. **Settings → Activity** lists who did what and when.

**Why it is useful.** A receptionist should not be able to change the business's settings, and a salesperson should see their own leads first. Roles do that. When someone leaves, their open leads and tasks must not be forgotten: removing a person hands them to a colleague you choose. The activity list answers "who changed that?".

**A day in the life.** Anita runs Nair Stays. On Monday she opens Settings → Team, taps **Invite a person**, types "Rahul Das", his email, picks **Staff (own leads only)** and sends it. Rahul opens the email on his phone, chooses a password and signs in; he sees only the leads given to him. In March Rahul leaves. Anita opens his menu, chooses **Remove from the team**, and the box asks "Remove Rahul Das?" with a list "Hand their open work to". She picks Meera. Rahul can no longer sign in; his open leads, tasks and tickets are now Meera's. Settings → Activity shows "Anita Nair removed a person from the team".

**Who can do what.**

| | Manager | Staff | Staff (own leads only) |
| --- | --- | --- | --- |
| See Settings → Team, Teams, Activity | Yes | No | No |
| Invite, cancel or resend an invitation | Yes | No | No |
| Change a role, remove a person, add them back | Yes | No | No |
| Add, change or delete a team | Yes | No | No |
| See the list of teams (names only, e.g. when giving out leads) | Yes | Yes | Yes |
| Accept an invitation | The invited person, with the link | | |

**Roles.** *Manager*: everything in the business. *Staff*: works on leads, contacts, tasks and the inbox; cannot change settings or the team, or delete. *Staff (own leads only)*: like Staff, but sees only the leads given to them. A role change works on the person's very next click.

**Settings and limits.** An invitation link works **once** and for **48 hours**; **Send again** makes a new link and the old one stops. Each person has one email, which belongs to one business. A business always keeps at least one manager, and nobody can remove themselves. A team name can be used once per business. You may put a person in several teams. At most 100 people per team.

**What it never does.** It never shows a password, never shows the words of notes, messages or settings in the activity list (only *what kind of thing* changed and the *names* of the fields), and never lets one business see another's people, teams or activity. Removing a person never deletes their history: their name stays on old notes and tasks.

**Not part of it.** Signing in to more than one business with one email (one email, one business for now). The invitation by WhatsApp message (comes with the WhatsApp channel; today the manager can copy the link and paste it into WhatsApp). Fine-grained permissions (later phase). "My alerts" settings for each person (F23). Reassigning a person's work from the lead and task screens (the lists to pick a colleague from arrive as those screens are updated).

### For the tech team

- **Module:** `core.auth` (it owns `users`); handlers for removing a person live in leads, tasks, tickets and offerings, listening to `team.member_removed`.
- **Tables:** `invitations` (053: hash of the link, 48 h expiry, one open per email per business), `teams` and `team_members` (054: composite keys keep both in one business; the name is unique per business ignoring case). Uses `users` (role, status) and `activity_log` as they were.
- **Routes (all under `/api/v1`):** `GET /team`, `POST /team/invitations`, `PATCH /team/members/{id}`, `DELETE /team/members/{id}?hand_over_to=`, `DELETE /team/invitations/{id}`, `POST /team/invitations/{id}/resend` (managers); `POST /auth/invitations/preview`, `POST /auth/accept-invitation` (public, limited, token in the body); `GET /teams` (any signed-in role), `POST /teams`, `PATCH /teams/{id}`, `DELETE /teams/{id}` (managers); `GET /audit-log` (managers; filters `person`, `area`, `from`, `to`, `page`, `limit`).
- **Events:** published `team.member_removed` (ids only). Handled by leads (open leads, the sharing-out rule), tasks (open tasks), tickets (open tickets), offerings (owner).
- **How it works.** Invitations and teams run in the business's fence. Accepting runs on the owner connection in one transaction: it finds the open link by hash, checks the password and that the email is still free, uses the link up in one statement, and creates the user (role and business from the invitation), their password hash and a verified email. Role changes and removals lock the business's active managers `FOR UPDATE` first so two managers cannot leave the business with none. Removing sets `users.status = 'disabled'` (the sign-in check already refuses disabled people on every request), ends their sessions, and publishes the event; each handler moves its module's open items and writes one activity line. The activity screen reads `activity_log` and fills in names from `users`.
- **Known limits.** The hand-over happens a moment after the screen answers (it is an event). Reassigning from lead and task screens waits for those screens to list colleagues. A removed person's email stays taken. WhatsApp invitations wait for F25. The activity list has no search by record yet.

## Decisions (recorded in docs/REQUIREMENTS-REVIEW.md as R70 to R73)

- **R70, one email, one business (kept).** The business switcher is not built.
- **R71, invitations by email now, WhatsApp with F25.** A Copy link button covers WhatsApp by hand today.
- **R72, remove means the person can no longer sign in; a manager can add them back.** Open work is handed over by the event `team.member_removed`.
- **R73, smaller decisions** (read-only Settings for staff, `GET /teams` open to all roles, several teams per person, what the activity screen shows, roles changed from the people list).
- Rules: at least one active manager always (changing or removing the last manager answers 409); a manager cannot remove themselves.

## Slice plan (at most 2 routes each)

1. `POST /team/invitations`, `GET /team`: Settings → Team (list, invite).
2. `POST /auth/invitations/preview` (a POST so the token is never in a logged address), `POST /auth/accept-invitation`: the accept page.
3. `PATCH /team/members/{id}` (role, add back), `DELETE /team/members/{id}` (remove with hand-over).
4. `DELETE /team/invitations/{id}` (cancel), `POST /team/invitations/{id}/resend`.
5. `POST /teams`, `GET /teams` (teams and their members).
6. `PATCH /teams/{id}`, `DELETE /teams/{id}`.
7. `GET /audit-log` and Settings → Activity (the Team, Teams and Activity tabs are hidden from staff).

## Slice log

**Slice 1 (built):** `POST /team/invitations`, `GET /team` (managers only). Migration `053_invitations.sql` (table `invitations`, only a hash of the link stored, one open invitation per email per business, 48-hour link). Files: `auth/repositories/invitations.repository.ts`, `auth/services/team.service.ts`, `auth/routes/team.routes.ts`, `auth/helpers/invitation-email.ts`, `packages/shared/src/team.ts`. Web: Settings → Team (`features/team/TeamPage.tsx`, `InviteMemberPanel.tsx`, `team-state.ts`); the Team tab shows for managers only. Tests: `team.test.ts` (9), isolation entries, `team-state.test.ts`, `e2e/team.spec.ts` (7 at phone and desktop).

**Slice 2 (built):** `POST /auth/invitations/preview`, `POST /auth/accept-invitation` (public, limited to 10 a minute, listed in `public-routes.ts` with reasons). Files: `auth/services/invitation-accept.service.ts`, `auth/routes/invitation-accept.routes.ts`, `findOpenInvitationByTokenHash` and `markInvitationAccepted` in the invitations repository. One transaction on the owner connection: checks the link, the password and that the email is still free, uses the link up in one statement (two requests at once: one wins), creates the user with the invited role in the inviting business, stores the password hash, counts the email as verified, writes the log line. A refused weak password rolls everything back, so the link still works. Web: `pages/AcceptInvitationPage.tsx` at `/accept-invitation?token=`. Tests: `team-accept-invitation.test.ts` (11), `e2e/accept-invitation.spec.ts` (4 at phone and desktop).

**Slice 3 (built):** `PATCH /team/members/{id}` (change role, or `status: 'active'` to add a removed person back) and `DELETE /team/members/{id}?hand_over_to=` (remove). Rules: the business always keeps one active manager (managers are locked `FOR UPDATE` before any change, so two at once take turns); nobody removes themselves; a removed person's role is not changed until they are added back; removing someone already removed does nothing; the hand-over person must be an active person of the business (404 for another business's id, 400 for a removed person or the same person), and is the removing manager when left out. Removing sets `status = 'disabled'` (the sign-in check refuses them at once), ends their sessions, and publishes `team.member_removed` (ids only: `userId`, `handOverToUserId`, `removedBy`). Four modules listen and move the open work: leads (open leads, and the sharing-out rule: the one person or fallback, and the round-robin list), tasks (open tasks), tickets (open tickets), offerings (their owner). Each writes one activity log line (`leads.handed_over`, …) and is safe to run twice. Web: a "…" menu on each person (not on your own row) with Make <role>, Remove from the team (an "Are you sure?" box naming the person, with a "Hand their open work to" list) and Add back. Tests: `team-members.test.ts` (15), isolation entries, e2e (5 more specs at phone and desktop).

**Slice 4 (built):** `DELETE /team/invitations/{id}` (cancel) and `POST /team/invitations/{id}/resend` (a new link; the old one stops; also revives an expired invitation; limited to 10 per 10 minutes). Web: a "…" menu on each waiting invitation (Send again, Cancel invitation with an "Are you sure?" naming the person). Tests: `team-invitations-manage.test.ts` (9), isolation entries, e2e (2 more specs).

**Slice 5 (built):** `POST /teams` (managers) and `GET /teams` (any signed-in person: team names and people names only). Migration `054_teams.sql` (`teams`, `team_members` with composite keys so a person and team must share a business; a team name is unique per business whatever the capital letters; removing a team will remove its member rows). Files: `auth/repositories/teams.repository.ts`, `auth/services/teams.service.ts`, `auth/routes/teams.routes.ts`. People must be active people of the business (404 otherwise, so another business's id looks unknown). `GET /team` now gives each person's teams. Web: Settings → Teams (`TeamsPage.tsx`, `TeamFormPanel.tsx`) and "Teams: …" under each person on the Team page. Tests: `teams.test.ts` (9), isolation entries, e2e (6 specs).

**Slice 6 (built):** `PATCH /teams/{id}` (rename and/or replace the whole list of people) and `DELETE /teams/{id}` (the people stay; the team's member rows go with it). A person removed from the business also leaves every team. Web: a "…" menu on each team (Change the team, using the same form; Delete the team with an "Are you sure?"). Tests: 9 more in `teams.test.ts`, isolation entries, 2 more e2e specs.

**Slice 7 (built):** `GET /audit-log` (managers; filters `person`, `area`, `from`, `to`, paging) and Settings → Activity. Files: `auth/repositories/audit-log.repository.ts`, `auth/services/audit-log.service.ts`, `auth/routes/audit-log.routes.ts`, `packages/shared/src/audit-log.ts`; web `features/team/ActivityPage.tsx`, `activity-state.ts` (groups of areas, the request address, a line in words: one sentence per known kind, an unknown kind is shown by its name so nothing is hidden). The response carries no address or browser. Tests: `audit-log.test.ts` (6), isolation entry, `activity-state.test.ts`, `e2e/activity.spec.ts` (6 at phone and desktop).
