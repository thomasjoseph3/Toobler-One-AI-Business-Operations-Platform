# F06: Pipeline and leads board

**Requirements:** `2-crm-core/03-leads-and-pipeline-board.md`; `requirements/API.md` (Leads and the pipeline board); docs/plan/PHASE-1.md (F06)
**Depends on:** F00, F01, F04      **Module:** `core.leads` (core: always on, no switch)

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
A **lead** is one enquiry that might become a sale. Leads sit on a **board** with one column per stage (New, Contacted, Quoted, Won, Lost), so the business sees at a glance who is waiting, who is being followed up, and how many enquiries become sales. This is also where the AI agent will save every enquiry.

### Why it is useful
- **Nothing gets forgotten.** Every enquiry has a stage and an owner.
- **Fair sharing.** New leads are given to the right person automatically.
- **Honest numbers.** A lead must have a reason when it is lost, so the business learns why it loses sales.

### How it works: a day in the life
1. A customer enquires. A lead is created for their contact and given to a team member by the sharing rule.
2. The team member moves it New → Contacted → Quoted as they work.
3. The customer says yes: the lead moves to **Won**, and the contact becomes a customer. Or the customer says no: moving to **Lost** asks for a reason such as "Too costly".
4. If a lost customer writes again within 60 days, the old lead is reopened at the first stage and the owner is told, rather than a duplicate being made.
5. The manager reshapes the board in settings: rename a stage, add one, reorder, or remove one (its leads must be moved to another stage first).

### Who can do what
- **Everyone signed in** can add, view, edit, move and reassign leads. The "own leads only" role sees only the leads assigned to them.
- **Managers** can delete leads, change the stages and lost reasons, and set how new leads are shared out.

### Settings and limits
| What | Value |
| --- | --- |
| Stages | New → Contacted → Quoted → Won / Lost. **Won and Lost always exist once and are last.** Other stages can be renamed, added, reordered or removed. |
| Open leads per contact | One |
| Lost reasons | 1 to 20; defaults: Too costly, Went elsewhere, Dates not available, No reply, Other |
| Re-enquiry window | 60 days |
| Sharing out new leads | All to one person, or round-robin over the people the manager names (a third mode, by offering, arrives with F17) |

### What it will never do
- Let a lead move to Lost without a reason.
- Remove Won or Lost, or a stage that still has leads without moving them.
- Give a lead to someone from another business.
- Write names, phones or emails into the activity log or events.

### Not part of this feature
The board screens (designer), scoring (F10), notes and timeline (F07), tasks (F08), and the AI's "save lead" tool (F19).

### For the tech team
- **Module:** `core.leads`. Migrations `010` to `012`. Tables `pipelines`, `pipeline_stages` (`kind` open/won/lost; exactly one Won and one Lost enforced by the database), `lost_reasons`, `assignment_rules`, `leads`. Every business, new and existing, gets the default pipeline, reasons and sharing rule (new ones from the sign-up service through the leads module's `index.ts`).
- **Routes:** `GET /pipeline`, `POST /pipeline/stages`, `PATCH /pipeline/stages/{id}`, `POST /pipeline/stages/reorder`, `DELETE /pipeline/stages/{id}?move_to=`, `GET/PUT /lost-reasons`, `POST/GET /leads` (list, or `?view=board`), `GET/PATCH/DELETE /leads/{id}`, `POST /leads/{id}/move`, `POST /leads/{id}/assign`, `GET/PUT /assignment-rules`.
- **The re-enquiry rule (R6)** is a pure function: open lead takes the new enquiry; lost under 60 days ago reopens; won under 60 days ago depends on the conversation type; older starts a new lead. The agent wires it in at F19.
- **Events:** `lead.created`, `lead.moved`, `lead.won`, `lead.lost`, `lead.reopened` (ids only), which the timeline (F07) and alerts (F23) will read.
- **Money** is in paise; `callback_at` is UTC; temperature stays `unscored` until F10.

### Known limits
- A disabled person can still be a lead's owner or in the round-robin until F02 (R39).
- Another lead's id appears in the 409 message to an "own leads only" person (R43).
- No screens yet (designer).

---

**Goal in one line:** a lead is one enquiry that might become a sale; leads sit on a board with one column per stage, so the
business sees at a glance who is waiting, who is following up, and how many enquiries turn into sales. It is the place the AI
agent (F19) will save every enquiry into.

## Owner decisions (12 Nov 2026)
1. **R6, the re-enquiry rule** (was open): an open lead takes the new enquiry; a lead **lost** less than 60 days ago is
   **reopened at the first stage and the owner is told**; a lead **won** less than 60 days ago: the conversation type decides
   (a new purchase starts a new lead, a question about the purchase becomes an `existing_customer` ticket, F14/F15); closed
   60 days or more ago: a new lead. F06 builds the rule as a pure function; the agent wires it in at F19.
2. **Left out until their feature** (each is one small migration): `team_id` (F02), `company_id` (F05), `offering_id` (F17),
   custom fields (F09), `temperature_reason` (F10). Until teams exist, **round-robin rotates over the people the manager names** (changed in slice 9, see R37); "by offering" waits for F17.
3. **Every lead's temperature is `unscored`** until F10.
4. **"Rahul moved this to Quoted"**: the timeline is F07, so until then the line goes to the activity log and an event
   (`lead.moved`); F07 reads them.
5. **The screens are parked for the designer**, as for F01, F03 and F04. F06 is backend only; the UI is planned below.

## Scope
- In: tables `pipelines`, `pipeline_stages`, `lost_reasons`, `assignment_rules`, `leads`; the default pipeline, lost reasons
  and sharing rule for every business (new and existing); all the routes below; the open-lead rule (pure function);
  the contact lifecycle update (`lead` on a new lead, `customer` on first Won, `repeat_customer` on later ones); activity log
  and events.
- Out: the screens (designer), the AI's `save_lead` tool (F19), the timeline (F07), tasks for callbacks (F08), companies,
  custom fields, scoring, teams, offerings, the team and role screens (F02),
  industry presets (the general preset only, as at sign-up).

## Rules
- A business has **one pipeline** with stages New → Contacted → Quoted → Won / Lost. **Won and Lost always exist exactly once,
  can't be removed or renamed away from their meaning, and are always the last two** (the database enforces one of each).
  Open stages can be renamed, added, reordered and removed.
- **Removing a stage that has leads needs `move_to`** (another open stage); without it the answer is 409. A stage with no
  leads is removed straight away.
- **Moving to Lost needs a reason** from the business's list (400 `LOST_REASON_REQUIRED`). Moving to Won or Lost sets
  `closed_at`; moving back to an open stage clears `closed_at` and `lost_reason` (reopen).
- The lost reason is stored as words on the lead, so renaming a reason later does not rewrite history.
- Every move records who did it, and writes `lead.moved` (and `lead.won` / `lead.lost` / `lead.reopened`) to the outbox.
- **One open lead per contact** (R6): `POST /leads` for a contact that already has an open lead answers 409 `LEAD_OPEN` with
  only `{ leadId }`.
- A lead's owner must be an active person of the **same business**; anything else answers 404.
- New leads are shared out by the business's rule: all to one person, or round-robin (the next person after the one who got the
  last lead, in a fixed order, so it is even). A lead created by hand with an owner uses that owner.
- Money in paise (whole numbers). Dates `date_from`/`date_to` are plain dates; `callback_at` is UTC.
- Soft delete of a lead: only managers; the row stays. Another business's id answers 404.
- Activity-log lines and events carry **ids and field names only**, never a name, phone or email.

## Reused from the hotel agent
- The "Port from" table in PHASE-1.md has **no row for F06**, so there was no old code to read. Nothing is ported; the
  hotel agent's guest bookings are not a pipeline. Reused ideas from F04: the repository/service/route shape, soft delete, the
  create-or-conflict pattern, and the actor stamps.

## Database (migration `010_leads_and_pipeline.sql`)
- `pipelines` (one per business), `pipeline_stages` (`kind` open/won/lost, unique name per pipeline, exactly one Won and one
  Lost), `lost_reasons`, `assignment_rules` (one row per business: `one_person` or `round_robin`), `leads` (see the file).
  All fenced by `account_id`, RLS forced.
- The migration also gives every **existing** business the default pipeline, five lost reasons (Too costly, Went elsewhere, Dates
  not available, No reply, Other) and the rule "all new leads go to the manager who signed up". **New** businesses get the same
  from the sign-up service (through the leads module's `index.ts`).
- The app role cannot delete leads, pipelines or assignment rules, and can change only the editable columns.

## API (at most 2 routes per slice)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/pipeline` | Staff | The stages in order, with a count of open leads in each |
| POST | `/pipeline/stages` | Manager | Add an open stage (goes before Won) |
| PATCH | `/pipeline/stages/{id}` | Manager | Rename any stage; Won and Lost keep their meaning ("Booked" is still Won) |
| POST | `/pipeline/stages/reorder` | Manager | The open stages in a new order |
| DELETE | `/pipeline/stages/{id}?move_to=` | Manager | Remove an open stage, moving its leads (409 `STAGE_HAS_LEADS` without `move_to`; never Won, Lost or the last open stage) |
| GET, PUT | `/lost-reasons` | Staff read, manager replace | The list the Lost dialog offers (1 to 20 reasons, no repeats ignoring capitals) |
| POST | `/leads` | Staff | Add a lead by hand (409 `LEAD_OPEN` if the contact has an open lead; 409 `LEAD_RECENTLY_LOST` if one was lost under 60 days ago) |
| GET | `/leads` | Staff | List, or `?view=board` for the board; filter by stage, owner, contact, open/closed; list order with `sort` (`lastActivity` default, `createdAt`, `callbackAt`, `stage`) and `order` (`desc` default, `asc`) |
| GET | `/leads/{id}` | Staff | One lead with its contact and stage |
| PATCH | `/leads/{id}` | Staff | Edit the details (not the stage or owner) |
| POST | `/leads/{id}/move` | Staff | Move to a stage (Lost needs `lostReason`) |
| POST | `/leads/{id}/assign` | Staff | Change the owner |
| DELETE | `/leads/{id}` | Manager | Soft delete |
| GET, PUT | `/assignment-rules` | Manager | How new leads are shared out |

## Slices
| Slice | What | State |
| --- | --- | --- |
| 0 | This brief and migration `010` | done; owner reviewed |
| 1 | `GET /pipeline`, `POST /pipeline/stages` (and the sign-up hook that gives a new business its pipeline) | done; owner tested |
| 2 | `PATCH /pipeline/stages/{id}`, `POST /pipeline/stages/reorder` | done; owner tested |
| 3 | `DELETE /pipeline/stages/{id}?move_to=` | done; owner tested |
| 4 | `GET /lost-reasons`, `PUT /lost-reasons` | done; owner tested |
| 5 | `POST /leads`, `GET /leads` (list and board); the open-lead rule; migration `011` | done; owner tested |
| 6 | `GET /leads/{id}`, `PATCH /leads/{id}` | done; owner tested |
| 7 | `POST /leads/{id}/move`, `POST /leads/{id}/assign`; the "not a fit" lifecycle fix | done; owner tested |
| 8 | `DELETE /leads/{id}` | done; owner tested |
| 9 | `GET /assignment-rules`, `PUT /assignment-rules` (round-robin); migration `012` | built; owner test pending |
| Journey | chained story test (`leads-journeys.test.ts`) | done |
| Review | security review with the `api-security` skill; `staff_own` added | done |
| Approval | owner approved the backend, 12 Nov 2026 (R37 confirmed) | done |
| UI 4 | **Leads list screen** (`apps/web/src/features/leads/`): the open leads as a table (tablet, desktop) or cards (phone), 25 to a page, tags coloured by stage kind and place, owner as You / Team member / Unassigned, callback date chip, row ticks, loading, empty and error states. Uses `GET /leads?status=open` and `GET /pipeline` only. | built, waiting for the owner's check |
| Sort | `sort` and `order` on `GET /leads` (added 13 Nov 2026 for the Leads list screen; tested in `leads.test.ts`) | done |
| UI | Board (drag on computer, **Move** on phone), list, lead page, Settings → Pipeline | **in progress** from 13 Nov 2026: the designer delivered only the Leads list frame, so we build the screens ourselves in that style (see "Leads list screen" below) |

## Leads list screen: what the Figma frame needs and what the API gives (13 Nov 2026)

The designer's frame (`docs/design/screens/leads-list-desktop.png`) is the only delivered screen. Slice by slice, we build the Leads list from it and design the other screens ourselves in the same style (design system v1.3). Two routes are enough for the list: `GET /leads?status=open` and `GET /pipeline`.

| Figma | Backend field or route | Status |
| --- | --- | --- |
| Lead Name, Email, Phone | `contact.name`, `contact.email`, `contact.phone` | **Have.** The name is optional: a contact needs a phone or an email, so a lead from an unknown caller has no name yet. The list shows the name, else the phone, else the email. The Create Lead form asks for a name; the AI saves the name when the caller gives one. |
| Status (tag) | `stage.name`, `stage.kind` | **Have.** Stage names are the business's own. The tag colour comes from the stage's kind and position, never its name. |
| Lead Source | `firstChannel`: `manual`, `web_chat`, `whatsapp`, `email`, `phone` | **Have the five channels only.** Shown as plain words. "Meta Ad" and "Referral" in the frame do not exist yet; sources like them are added later (owner, 13 Nov 2026). |
| Lead Owner | `ownerUserId` (an id, no name) | **Missing the name.** The leads module cannot read the users table, and the team list is F02. Until then the column shows "You" for the signed-in person and "Team member" for anyone else. The name comes with F02. |
| Next Activity | `callbackAt` | **Partly.** "Next activity" is the next thing to do for a lead: a meeting, a call or a note (owner, 13 Nov 2026). Only a callback date exists today and is shown as the date chip. **The designer is making the screen for adding these**, so we do not design it; it arrives with tasks (F08), notes (F07) and follow-ups (F27). The two hover icons in the row (log an activity, add a note) are drawn and do nothing until then. |
| Sort | `sort`, `order` on `GET /leads` | **Added 13 Nov 2026.** By newest activity, date added, next callback (leads without one last) and stage. **Not yet:** sorting by name, email or phone, which belong to the contacts module (a later change). |
| Filter | `stageId`, `ownerUserId`, `status` on `GET /leads` | Have. |
| Showing 5 of 28 open leads, Previous and Next | `total`, `page`, `limit` | Have. |
| Create Lead | `POST /leads` (needs a contact id) and `GET /contacts` to choose or add the person | Have. |
| Owner of new leads | `GET` and `PUT /assignment-rules` (one person, or round-robin), `ownerUserId` on `POST /leads`, `POST /leads/{id}/assign` | Have (backend). |
| Row actions (log activity, add note) | none | Not built: notes F07, tasks F08. Left out. |
| Import, Export | none | Not built: F12. Left out. |
| Split view, search box | none | Not described / F11. The search box and the notification bell are drawn but switched off. |
| Row checkboxes | none | Drawn as in the frame; nothing acts on a selection yet. |
| Count badges in the sidebar (Leads 6, Tasks 9, Inbox 4) | none | Need counts from the API; not shown yet. |

## Screens

- **Leads → Board:** a column per stage with a count; cards show name, interest, dates, temperature (icon + word), owner, time
  since last activity. Drag on a computer; a **Move** button on a phone. Moving to Lost opens a dialog asking for the reason.
  Empty column: "No leads here yet". Loading and error states on every list.
- **Leads → List:** the same leads as rows with filters.
- **Lead page:** details, buttons Move stage, Assign; (notes, calls, tasks arrive with later features).
- **Settings → Pipeline:** rename, add, reorder, remove stages (asks "Are you sure?" naming the stage); lost reasons; how new
  leads are shared out.

## Tests
- Unit: the open-lead rule (all four R6 cases, the 60-day edge), the round-robin pick (even over many leads, skips a disabled
  person, wraps around), stage order helpers.
- API, every route: works / 401 / 403 (wrong role) / 404 (another business's id) / 400.
- Specific: Won and Lost can't be removed or added twice; Lost needs a reason; removing a stage moves its leads; reorder keeps
  Won and Lost last; two requests creating a lead for one contact at once leave one lead; an owner from another business is
  refused; the app role cannot delete a lead.
- Isolation: an entry for every route. Schema test: every new table has RLS forced.
- Journey test: the life of a lead from New to Won, and from New to Lost and back.

## Manual test script
The screens are parked for the designer, so F06 is tested through the API. Two ways, the same checks:

**A. Postman (recommended).** In Postman, My Workspace: collection *Toobler One - F06 leads and pipeline (run in order)* and environment *Toobler One - local dev*.
1. Start the API (`npm run dev`) and apply the migrations (`npm run db:migrate`: 010, 011 and 012 must be applied).
2. In the environment, set `email` and `password` (current values) to a MANAGER of a verified test business.
3. Run the collection with the Runner, folders 0 to 7 in order. Every request checks its answer; all must pass. It leaves the business as it found it (the test lead and contact are soft-deleted).

**B. By hand, the main path** (each step: what you send, what you should see):
1. Sign in, `GET /pipeline` → New, Contacted, Quoted, Won, Lost with `sort` 0 to 4.
2. `POST /pipeline/stages` `{"name":"Site visit"}` → 201, it sits before Won. Same name in capitals → 409 `STAGE_EXISTS`.
3. `PATCH /pipeline/stages/{id}` rename; `POST /pipeline/stages/reorder` with all open ids → new order; leave one out → 400 `STAGES_MISMATCH`.
4. `DELETE` Won → 409 `CLOSING_STAGE_CANNOT_BE_REMOVED`.
5. `PUT /lost-reasons` `{"reasons":["Price too high","Chose a competitor"]}` → the list; the same reason twice → 400.
6. `POST /contacts`, then `POST /leads` `{"contactId":"…","interest":"3 nights in December","partySize":4,"budgetPaise":4500000}` → 201 in the first stage, owner you; again → 409 `LEAD_OPEN`. The contact is now `lead`.
7. `GET /leads`, `GET /leads?view=board`, `GET /leads/{id}`, `PATCH /leads/{id}` (end date before start → 400 `INVALID_DATES`).
8. `POST /leads/{id}/move` to Lost without a reason → 400 `LOST_REASON_REQUIRED`; with one → closed, contact back to `new`; adding another lead for her → 409 `LEAD_RECENTLY_LOST`; move back to an open stage → reopened; to Won → contact `customer`.
9. Move the lead into Site visit, `DELETE /pipeline/stages/{id}` → 409 `STAGE_HAS_LEADS`; with `?move_to=<another open stage>` → 200, the lead moved.
10. `POST /leads/{id}/assign` `{"ownerUserId":null}` then your own id → 200; a made-up id → 404.
11. `GET/PUT /assignment-rules` round-robin with your id, then back to one person.
12. `DELETE /leads/{id}` → 204, then 404 on read; the contact goes back to `new`.
13. Fence checks: signed out → 401 on every route; role `staff` → 403 on stage changes, lost-reason changes, assignment rules and deleting a lead, but 200 on reading and working leads; a second business's token → 404 on the first one's lead and stage ids.
14. Unmark "not a fit" on a contact that has an open lead (`PATCH /contacts/{id}` `{"notAFit":false}`): the answer says `new`, and about a second later the contact reads `lead`.

## Security checklist
Reviewed with the `api-security` skill on 12 Nov 2026 (the whole F06 diff: 14 routes, 5 tables, migrations 010 to 012).

- [x] Every new table has account_id, RLS enabled + forced, and the schema test passes (`pipelines`, `pipeline_stages`, `lost_reasons`, `assignment_rules`, `assignment_rule_people`, `leads`).
- [x] Every new route: role guard on the route; tests for works / 401 / 403 wrong role / 404 other business / 400 bad input. Reads are `staff`; stage changes, lost reasons, deleting a lead and the sharing-out rule are `manager`. Routes with no id in them (`GET /pipeline`, `POST /pipeline/stages`, the reorder, lost reasons, assignment rules) have no "other business's id" to try; the nearest case (a stranger's stage or person named in the body) is tested and answers 404 or 400.
- [x] Every list, search and export respects staff_own. **Found in this review and fixed:** the guard lets `staff_own` through every `staff` route, so the leads service now limits that role to the leads it owns (list, board, stage counts, read, edit, move, assign), answers 404 for any other lead even by typed URL, and lets it add leads only in its own name (naming someone else is 403). Tested in `leads.test.ts` ("the own leads only role"). Contacts' own `staff_own` filter is still F04's open item (F02/F11); a lead shows only its own contact's name, phone and email.
- [x] No business id taken from body, query, params or tool arguments. The business always comes from the session; every body schema is `.strict()`, so an `accountId` is refused with 400 (tested).
- [x] All input validated with zod, with max lengths; no SQL built from strings. The only raw SQL is two fixed fragments (`lower(label)`, `nulls first`) with the user's text passed as a parameter.
- [x] New public route? None added.
- [x] New webhook? None added.
- [x] New agent/assistant tool? None added (the AI's `save_lead` is F19).
- [x] New outside call with a user-given URL? None.
- [x] New file upload? None.
- [x] Nothing new logged that is personal data or a secret. Activity-log lines and events carry ids and field names only; tested for lead text, lost reasons, stage names and contact details. `process.env` is read only in `kernel/config.ts`.
- [x] Deletes ask first in the UI (UI is parked for the designer: the "Are you sure?" naming the stage or lead is in its list); deletes and setting changes write the activity log (tested).
- [x] Secrets encrypted at rest and shown only as previews: no secrets in F06.
- [ ] `npm run verify` passes: to be run at hand-off (the e2e part waits for the screens).

Defence in depth added by the database, not only the app: a lead's owner and the sharing-out people must work for the same business (composite foreign keys); a contact has at most one open lead (unique index); the app role cannot delete leads, pipelines or sharing-out rules; the stage lead-count join repeats the business.

Known limits, recorded rather than hidden:
- A disabled person can still be named as an owner or a round-robin person; the check arrives with the team feature (F02, which also adds disabling).
- Round-robin ignores working hours, "Away" and workload. Planned with F02: see R52 in docs/REQUIREMENTS-REVIEW.md.
- `LEAD_OPEN` and `LEAD_RECENTLY_LOST` name the other lead's id to a `staff_own` person even when it is not theirs. The id alone opens nothing (reading it is 404), and they need it to understand why they cannot add a lead.
- The shared isolation suite was added on 12 Nov 2026 (R41, `apps/api/test/isolation.test.ts`); it holds an attempt for every leads and pipeline route.
- `npm audit` shows moderate findings that were there before F06; F06 adds no package.

## Decisions and differences from the requirements
- R6 filled in as above (the requirement is silent on a lead closed less than 60 days ago).
- `lost_reason` is words on the lead, not an id, so history stays true when reasons are renamed.
- `assignment_rules.last_assigned_user_id` is added so round-robin is a stored turn, not a guess from the leads table.
- `owner_user_id` is included now (F04 left it out) because assigning a lead is part of F06; the same-business check is in the
  service.
- Round-robin is over all active staff until teams (F02).
- Removing a stage moves its leads (deleted ones too, since they still point at the stage) without changing their last-activity time: a board tidy-up is not contact with the customer. One activity-log line and one event (`pipeline.stage_removed`, counts and ids only) record it; per-lead timeline lines are not written (F07 can read the event).
- The last open stage cannot be removed, so the board always has somewhere for new leads.
- Replacing the lost reasons deletes and re-adds them, so their ids change on every save. That is safe because a lead stores the words, not the id. Concurrent saves take turns through a lock on the business's pipeline row.
- **Slice 5, migration `011`.** Two rules are enforced by the database as well as the app: a lead's owner must work for the same business (a composite foreign key on `users (account_id, id)`, because the leads module may not read the users table and auth already requires leads), and a contact has at most one open lead (a partial unique index, so two simultaneous adds cannot both win).
- **Adding a lead by hand and R6.** Open lead: 409 `LEAD_OPEN`. Lost under 60 days ago: 409 `LEAD_RECENTLY_LOST` pointing at that lead, because reopening belongs to the move route (slice 7). Won under 60 days ago: a new lead is created (staff adding by hand is a new purchase). The AI agent (F19) will use the same pure function `decideWhatToDoWithEnquiry` to attach, reopen, or ask the conversation type.
- **Board.** Every stage is a column with up to 50 newest leads and the full `leadCount`; `hasMore` says when there are more. The board honours the owner and contact filters, and ignores `stageId`, `status`, `page` and `limit`.
- **Owner on a new lead** is the named person, otherwise the "one person" rule's person. Round-robin arrives in slice 9. The owner's name is not in the answer yet (the team list is F02); the card shows `ownerUserId`.
- **Contact lifecycle.** A new lead moves the contact to `lead` (through `contacts/index.ts`). Known gap from F04: un-marking "not a fit" still computes the stage as if the contact had no leads. It will be fixed in slice 7 (when leads can be won) with an event, so contacts never have to import leads.
- A made-up `/leads` route in `http.test.ts` (a test of the module switch) was renamed so it does not clash with the real route.
- **Slice 6, editing a lead.** `PATCH /leads/{id}` changes interest, dates, party size, budget, promise and callback. The stage, owner, contact and temperature are refused (400): they have their own routes or features. It follows the contacts edit rules: an empty body is 400 `NOTHING_TO_CHANGE`, blank text or `null` clears a field, and sending what is already stored changes nothing (no log line, no event). The end date is checked against what the lead will hold after the change (400 `INVALID_DATES`). Two edits at once take turns on a lock on the lead row, so neither overwrites the other. "Last activity" does not move on an edit.
- The test app's app-wide rate limit (300 a minute) is raised in `buildTestApp`, like the per-route limits already were; `http.test.ts` still tests the limit itself.
- **Slice 7, moving a lead.** `POST /leads/{id}/move` takes `stageId` (and `lostReason` for Lost). Lost needs one of the business's reasons, matched ignoring capitals and stored as the business wrote it (400 `LOST_REASON_REQUIRED` / `INVALID_LOST_REASON`); a reason sent to any other stage is 400 `LOST_REASON_NOT_ALLOWED`. Won and Lost set `closed_at`; moving a closed lead to an open stage clears `closed_at` and the reason (reopen) and publishes `lead.reopened`, which is how R6's "reopen a lead lost under 60 days ago, and tell the owner" is carried out (the notification itself is F23). Reopening while the person has another open lead is 409 `LEAD_OPEN`. A move counts as activity on the lead (`last_activity_at` moves). Events: `lead.moved` always, plus `lead.won`, `lead.lost` or `lead.reopened`; ids only.
- **Assigning.** `POST /leads/{id}/assign` takes `ownerUserId` (a person, or `null` for nobody). The person must work for the business (404 otherwise; the database enforces it). Assigning does not move "last activity". "Disabled" people cannot be refused yet: the status check arrives with the team feature (F02).
- **Contact lifecycle on every move**: won leads make a customer (two or more, a repeat customer), an open lead a lead, otherwise new; "not a fit" is never overwritten.
- **The F04 "not a fit" gap is closed.** Taking the mark off a contact now publishes `contact.unmarked_not_a_fit`; the leads module reacts by working the stage out again from the contact's real leads. The route's answer still says `new` straight away; the correct stage shows a moment later (the event dispatcher runs about once a second).
- **Slice 8, deleting a lead.** `DELETE /leads/{id}` is manager-only and answers 204. It is a soft delete (the row stays). The lead disappears from the board, the lists and the stage counts; the contact's lifecycle stage is worked out again without it (a lead goes back to new, a customer whose only won lead was deleted goes back to new), and the contact can be given a new lead. A second delete, another business's lead and an unknown id answer 404; two deletes at once let one succeed.
- **Slice 9, sharing out new leads (R37).** `GET /assignment-rules` and `PUT /assignment-rules` are manager-only. The rule is either `one_person` (with `userId`) or `round_robin` (with `userIds`, in turn order, 1 to 50, no repeats). The brief had planned to rotate over all staff, but the leads module cannot read the users table (auth owns it and already requires leads), so the manager names the people instead; they are kept in `assignment_rule_people` (migration `012`) and the database checks they work for the business. F02 will turn this list into a team. A new lead takes the named owner if the request names one (this does not use up a turn), otherwise the rule picks: the one person, or the next person after the one who got the last lead, wrapping round. Changing the rule starts the rotation from the first person. The rule row is locked while a lead picks its owner, so leads added at the same moment get different people, and a lead that fails to save does not use up a turn. Migration `012` also makes the rule's own people check the business (they only had to exist before).
- Not built, by design: "by offering" (F17), and refusing disabled people (F02).
