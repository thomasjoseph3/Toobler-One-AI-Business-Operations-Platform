# F06: Pipeline and leads board

**Requirements:** `2-crm-core/03-leads-and-pipeline-board.md`; `requirements/API.md` (Leads and the pipeline board); docs/plan/PHASE-1.md (F06)
**Depends on:** F00, F01, F04      **Module:** `core.leads` (core: always on, no switch)

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
  custom fields, scoring, teams, offerings, the "own leads only" filter (F02/F11; for now every staff member sees all leads),
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
| GET | `/leads` | Staff | List, or `?view=board` for the board; filter by stage, owner, contact, open/closed |
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
| Journey | chained story test | planned |
| UI | Board (drag on computer, **Move** on phone), list, lead page, Settings → Pipeline | on hold (designer) |

## Screens (for when the designer delivers)
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
Written slice by slice (each slice's hand-off gives the exact Postman steps); the full script is assembled at the end.

## Security checklist
Ticked at hand-off with the `api-security` skill.

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
