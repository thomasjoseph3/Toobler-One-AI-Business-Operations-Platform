# Users, roles and teams

**Phase 1 · Foundation · HubSpot equivalent: User management, Teams, Permission sets**

## What it is

The business owner invites their staff. Each person has a login and a role that decides what they can see and do.
Staff can be put into teams, such as "Sales" or "Front office", so leads can be shared out by team.

## Why it matters

A receptionist shouldn't be able to delete the business's settings. A salesperson should see their own leads first.

## How it works

1. The owner opens **Team** and types a staff member's name, email and phone.
2. The staff member gets an invitation by email and WhatsApp, and sets their password.
3. The owner picks their role and, if they like, a team.
4. New leads can be given out to a team in turn (see [leads](../2-crm-core/03-leads-and-pipeline-board.md)).

**Roles:**

| Role | Can do |
| --- | --- |
| Manager | Everything for their business: settings, team, billing, all leads, delete |
| Staff | Work on leads, contacts, tasks, inbox. Can't change settings, team or billing, or delete. |
| Staff (own leads only) | Same as Staff, but sees only the leads given to them or their team |

## Rules

- Every business has at least one manager.
- Removing a person asks "Are you sure?" and hands their open leads and tasks to someone else first.
- One person can work for more than one business and switch between them.

## Screens

- **Settings → Team:** list of people with role, team, last seen; Invite, Change role, Remove.
- **Settings → Teams:** add, rename, remove a team; pick its members.

## Done when

- [ ] A manager invites a staff member, who signs in and sees only what their role allows.
- [ ] A "own leads only" staff member can't open another person's lead, even by typing its address.
- [ ] Removing a person moves their open leads and tasks to the person the manager picks.

## Better than HubSpot

- Invitations also go by WhatsApp, where staff will actually see them.
- Three simple roles instead of a long permissions screen. Fine-grained permissions come in Phase 7 for larger firms.

## For developers

- **Code folder:** `apps/api/src/core/users`
- **API:** [API.md](../../API.md), Phase 1 → Users, roles and teams
- **Tables:** `users`, `memberships` (`role`: `manager`, `staff`, `staff_own`), new `teams`
  (`account_id`, `name`) and `team_members` (`team_id`, `user_id`).

## Open questions

- Do we need the "own leads only" role in Phase 1, or can it wait for the first business that asks?
