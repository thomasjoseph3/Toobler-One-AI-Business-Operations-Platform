# F22 Today page

**Status:** approved · **Branch:** `feature/F22-today-page` · **Requirement:** `requirements/phase-1-lead-engine/4-staff-workspace/01-today-page.md`

## Feature guide

**What it is.** Today is the first screen a staff member sees after signing in. It answers one question — *who do I
call next?* — and lets them act on it in one tap.

**Why it is useful.** Staff open the app between other jobs. Instead of a menu, they get their next action straight
away: who is overdue, which hot leads nobody has rung, what is due today, who came in overnight, and how the week is
going. Every person has **Call** and **WhatsApp** buttons that open the phone's dialler or WhatsApp.

**A day in the life.** Anita signs in at 9 a.m. The top of Today shows *Late*: a callback she promised yesterday. She
taps **Call**. Under it, *Hot — not yet contacted* lists a new enquiry; she taps **WhatsApp**. She glances at *This
week*: 12 leads in, 9 contacted, 3 won, average 14 minutes to first reply. Done in under a minute.

**Who can do what.** Everyone signed in sees their own Today. Managers and ordinary staff can switch between **Mine**
and **Team** (the whole business). The "own leads only" role sees only its own and has no Team switch. Managers also
see a small *finish setting up* nudge with how many setup steps are left.

**What it shows, in order.** *Late* (overdue tasks and past callbacks) · *Hot, not yet contacted* · *Due today* (your
tasks) · *Came in overnight* (new leads since closing) · *This week* (leads in / contacted / won, and average time to
first reply).

**Settings and limits.** Nothing to configure. The page refreshes by itself when a lead or task changes. "Closing
time" is 6 p.m. for now (real office hours come with F23); "time to first reply" counts the first staff touch (a stage
move or a note) until phone calls are logged (F29).

**What it never does.** It never adds, edits or deletes anything — it is a read-only starting point. It never shows
another business's data, and it never shows the team view to the own-leads-only role.

**Not part of it.** Staff alerts and the morning summary (F23), real office hours (F23), and logged phone calls (F29).

### For the tech team

- **Module:** `core.today` (always on; owns no table, adds no write route). Reads `leads`, `tasks`, `activities`
  (first staff touch), `setup_steps` and `accounts.time_zone` through each module's `index.ts`.
- **Route:** `GET /api/v1/today?scope=me|team` (access `staff`). 400 on a bad scope, 401 signed out, 403 when the
  own-leads-only role asks for `team`.
- **How it works:** the service computes the business-time-zone day/week/closing boundaries (`helpers/today-bounds.ts`),
  reads the leads and tasks (scoped to the owner for `me`), works out each section in pure code
  (`helpers/today-sections.ts`), then adds contact names, E.164 phones and owner names.
- **Live updates:** the page listens to `GET /events`; F22 added the lead and task event names to the live allowlist
  (`live-updates/helpers/live-events.ts`), and the own-leads-only role now hears its own lead/task events (ids only).
- **Known limits / decisions (R81):** "contacted", "closing time" (18:00 constant) and "first call" are approximations
  until F23 (office hours) and F29 (calls). No table, no write route.
- **Tests:** `today-sections.test.ts` (6), `today-bounds.test.ts` (8), `today.test.ts` (7 API), isolation entry; the
  browser spec is pending the batched e2e run.

The Today page is the first screen a staff member sees when they sign in. It answers one question — **who do I call
next?** — and lets them act (Call / WhatsApp) without hunting through menus.

## Scope

**In:**

- One read endpoint `GET /api/v1/today?scope=me|team` that returns all sections of the page in one response.
- Five sections, in this order: **Late**, **Hot (not yet contacted)**, **Due today**, **Came in overnight**, **This week**.
- A **setup checklist slot**: the count of unfinished setup steps (from F31 `setup_steps`), shown only to managers, so a
  half-finished setup is visible from Today. No new setup logic — it only reads the existing steps.
- `scope=me` (my own items) and `scope=team` (the whole team). Managers and ordinary staff may ask for either; the
  "own leads only" role (`staff_own`) is always limited to its own and may not ask for `team`.
- A phone-first Today screen (`apps/web`) with Call and WhatsApp buttons on every lead item, a manager/staff team switch,
  and empty / loading / error states for every section.
- Live updates: the page listens to the existing `GET /events` stream and re-reads Today when a lead or task event
  arrives (no new stream; F22 only adds its event names to the live list).

**Out (not built here):**

- No new table and no new write route. Today only reads leads, tasks, activities and setup steps that already exist.
- No office-hours setting (that is F23); "closing time" is a documented constant for now (see Decisions).
- No real call logging (that is F29 Phone); "first call" is approximated by "first staff touch" (see Decisions).
- No staff alerts or morning summary (F23).

## Reused from the hotel agent

The Port-from table in `docs/plan/PHASE-1.md` has **no row for F22** — the old project had no "Today / next call"
workspace to port. Nothing was reused; the page is new, built on our own leads, tasks and activities modules.

## Migration

**None.** Every section is computed in code from existing tables: `app.leads` (010, temperature/closed/callback/owner/
created_at/stage), `app.pipeline_stages` (010, stage kind + sort), `app.tasks` (050, due/done/owner), `app.activities`
(048/049, `stage_changed` + staff `note`), `app.setup_steps` (042). The business time zone is `accounts.time_zone`
(002). No column is missing for the definitions below.

## Decisions (recorded in REQUIREMENTS-REVIEW.md as R81)

The requirement names three things the Phase-1 schema does not yet track literally. Each is given a clear,
code-decidable definition now, to be revisited when its later feature lands:

1. **"Not yet contacted"** — a lead counts as *contacted* once it has either moved stage (`activities.kind =
   'stage_changed'`) or received a staff `note`. "Hot, not yet contacted" = a `hot` lead, still open, with no such
   activity. (When F29 adds calls, a logged call will also count as contact.)
2. **"Came in overnight, since closing time"** — there is no office-hours setting until F23. A constant
   `CLOSING_HOUR = 18` (18:00 business-local) is used: overnight = new, uncontacted leads created since the most recent
   local 18:00. F23 replaces the constant with the business's real closing time.
3. **"Average time to first call" (This week)** — until F29 logs calls, "first call" means "first staff touch": the
   earliest `stage_changed` or staff `note` on the lead. The average is over this week's leads that have been touched.
   The label shown is "Average time to first reply" so it is honest about what is measured.

## The sections (all in the business time zone, computed in `today.service` with pure helpers in `helpers/today-sections.ts`)

| Section | What it holds | Rule (code decides) |
| --- | --- | --- |
| Late | Callbacks and tasks past their time | Open tasks with `due_at < now`; leads with `callback_at < now` and still open. |
| Hot | Hot leads not yet contacted | `temperature = 'hot'`, open, no `stage_changed`/`note` activity. |
| Due today | My tasks due today | Open tasks with `due_at` before the start of tomorrow (business-local). |
| Overnight | New leads since closing | Uncontacted leads with `created_at` ≥ the last local 18:00. |
| This week | Counts + average | Leads in / contacted / won since the local week start; average time-to-first-touch. |

Scope: `me` filters by `owner_user_id = me` (leads) and `owner_user_id = me` (tasks); `team` is every owner in the
business. `staff_own` is forced to `me` and gets 403 if it asks for `team`.

## Endpoint

`GET /api/v1/today?scope=me|team` — access `staff` (any signed-in, verified person). The business and the caller come
from the session, never from the request. Returns `{ scope, sections: { late, hot, dueToday, overnight, thisWeek },
setupChecklist }`. 400 on a bad `scope`; 401 when signed out; 403 when `staff_own` asks for `team`.

## Screens (phone first, 375 px)

Today screen: a greeting line, the team switch (manager/staff only), then each section as a card with a count, its
items (contact name, what they want, temperature chip with icon+word, Call and WhatsApp buttons using the contact's
E.164 phone via `tel:` and `https://wa.me/`), and an empty state ("Nothing late", etc.). Loading skeletons and an error
state with Retry per the front-end rules. Desktop widens the cards to two columns. All text through `t()`; tokens and
components from `packages/ui` only.

## Tests

- **Unit** (`helpers/today-sections.test.ts`): each section's rule against hand-made leads/tasks/activities; the
  closing-time boundary; the average calculation; the contacted/not-contacted rule.
- **API integration** (`today.routes.test.ts`): each section returns the right items for seeded data; `scope=me` vs
  `scope=team`; works / 401 / 400 (bad scope).
- **Isolation** (`isolation.test.ts` entry): another business's leads never appear; `staff_own` asking for `team` → 403
  (404/403 register entry with a reason).
- **Browser** (`e2e/today.spec.ts` + `e2e/pretend-today.ts`): the page shows each section, the team switch works, a new
  hot lead appears after a live event without reloading; empty and error states.

## Manual test script

1. Sign in as a manager. The Today page is the landing screen.
2. **Late:** create a task due in the past (or a lead with a past callback). It shows under Late with Call/WhatsApp.
3. **Hot:** from the web-chat widget, create a hot lead; it appears under "Hot — not yet contacted" within a few
   seconds without reloading. Move it one stage; it leaves the Hot section.
4. **Due today:** add a task due later today → appears under Due today.
5. **Overnight:** seed a lead created last night (before 18:00 boundary logic) → appears under "Came in overnight".
6. **This week:** check the in / contacted / won counts and the average line match your week's data.
7. Switch to **Team** → you see every owner's items. Sign in as a `staff_own` user → no team switch; the API refuses
   `scope=team`.
8. On a phone, tap Call (opens the dialer) and WhatsApp (opens the chat).

Expected: each section matches the seeded data; the live update arrives without a reload; buttons open the dialer/WhatsApp.

## Security checklist

- [ ] Account fence on every read (`runInAccountTransaction`); account from session only.
- [ ] Another business's id/data never returned (isolation test).
- [ ] Role respected: `staff_own` limited to own, 403 on `team`.
- [ ] No personal data or secrets in logs or in the live-event payload (ids only).
- [ ] `scope` validated by zod; bad value → 400.
- [ ] Read-only: no new write route, no new grants.

## Differences from the requirements

The three Decisions above (contacted, closing time, first call) are approximations forced by what Phase 1 tracks so
far; each names the later feature (F23 office hours, F29 calls) that will make it exact. The "This week" average is
labelled "time to first reply" to stay honest about what is measured.
