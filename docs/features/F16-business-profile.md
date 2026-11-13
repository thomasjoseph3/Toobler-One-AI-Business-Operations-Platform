# F16: Business profile, business questions and situations

**Requirements:** `3-ai-agents-and-channels/09-business-questions.md`, `08-knowledge-base.md` (the Business profile and Situations parts); `requirements/API.md` (Knowledge base); docs/plan/PHASE-1.md (F16)
**Depends on:** F00, F01     **Module:** `core.knowledge` (core: always on, no switch; later features F17, F18 and F19 add to it)
**Status:** approved by the owner on 12 Nov 2026 (backend; the profile and situations screens wait for the designer). All slices tested by the owner in Postman.

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
This is the business telling the AI who it is. A fixed list of questions (about 26 general ones, plus a few extra for the business's industry) covers what the business does, where it is, when it opens, its contact details, languages, policies, and more. The answers are the **business profile**. Seven **situations** (a discount request, fully booked, a customer who wants a person, and so on) each have a ready-picked way of handling them that the manager can change. A **completeness score** shows how much is answered and what is still missing before the business can go live.

### Why it is useful
- **The AI answers from facts, not guesses.** Everything it says about the business comes from these answers.
- **Fast set-up.** Sensible defaults mean a new business already handles every situation sensibly without answering anything.
- **A clear to-do list.** The score names what is missing and what is needed to go live.

### How it works: a day in the life
1. A manager opens the profile and answers "What is your business name?", "What do you do?", "What is your address?" and "When are you open?". The score rises with each answer.
2. They set their time zone and default country (opening hours and phone numbers depend on them).
3. They look at the seven situations. For "A customer asks for a discount" the first choice is already picked; they choose a different way to handle it.
4. The profile shows "ready to go live" once every needed question is answered. (A later feature does the actual go-live.)

### Who can do what
- **Everyone signed in** can read the questions, answers, situations and settings.
- **Managers** can answer questions, change situations, and change the time zone and default country.

### Settings and limits
| What | Value |
| --- | --- |
| Answers a manager types | Confirmed at once. Answers filled in by the system later (from a website) wait for a check and are not used until a manager accepts them. |
| Industry extras | Hotel or resort, travel agent, clinic, car dealer, school or coaching, wedding planner, real estate |
| Fixed situations | A complaint, an exact price, and an unknown answer cannot be changed |
| Time zone / default country | Start at Asia/Kolkata and India |
| Questions answered elsewhere | What you sell (Offerings), offers, extra FAQs; documents are on hold |

### What it will never do
- Give the AI an answer that is still waiting for a check.
- Write the answers themselves into the activity log (only question keys).
- Do any maths with answers: scores are computed in code.

### Not part of this feature
Reading a website to pre-fill answers (F31), uploads (on hold), the AI using the answers (F19), the setup chat (F31), and the profile screens (designer).

### For the tech team
- **Module:** `core.knowledge` (always on). Migrations `014` (tables), `015` (more industries), `016` (`accounts.default_country`). Tables `business_answers` (one row per business and question; `value` jsonb, `source`, `status`) and `situations` (one row per business and situation). The question list is **code**, not a table, so it can be tested and versioned (`helpers/general-questions.ts`, `industry-questions.ts`).
- **Answer types** each have a validator (short text, long text, pick one or several, yes/no, weekly hours, list rows, price in paise, link, file reference). Unknown keys are 404; a bad answer is 400 `INVALID_ANSWER`.
- **Routes:** `GET /knowledge/questions` (with progress and go-live readiness), `PUT /knowledge/answers/{question_key}`, `POST /knowledge/answers/confirm` (all or none), `GET /knowledge/situations`, `PUT /knowledge/situations/{key}` (400 `SITUATION_FIXED`, `INVALID_CHOICE`), `GET/PUT /knowledge/settings`.
- **Industry** reaches the module through `Principal.industryId`; the module never reads the `accounts` table.
- **Answered elsewhere:** questions handled by other features report from them: offerings (F17) and FAQs (F18) feed the score; documents stay "not tracked".
- **Contacts** read the default country through the module's `index.ts`.

### Known limits
- Extras for restaurants, auto service, salons and gyms are not written yet.
- No screens yet (designer).

---

**Goal in one line:** a fixed list of questions tells the system everything the AI agent must know about a business: what it does, where it
is, when it opens, how it handles a discount request, a complaint, an after-hours call. The owner answers them (the form now, the setup
chat later in F31); the answers are the business profile and "situations" that the AI agent (F19) will answer customers from. A score
shows how complete the profile is and whether the business has answered everything "needed to go live".

## What the owner sees (later, when the screens arrive)
Knowledge base → **Business profile**: sections A to H, each question with its answer and a source tag ("You typed this" now; "From your
website, Please check" once the website reader exists in F31). A **completeness score** at the top says what is missing and why it
matters. Knowledge base → **Situations**: seven moments (discount, full, speak to a person...) each with a ready choice already picked.

## Questions for the owner (my default in bold) — owner chose all four defaults, 12 Nov 2026
1. **Questions that belong to later features.** C1 (what you sell, the offerings list), C4 (offers running now), D2 (FAQs) and A3 (upload a
   brochure) are really the Offerings (F17), FAQs and Documents (F18) features. **I define them in the question list, marked "answered in
   Offerings / FAQs / Documents", but F16 does not let you answer them, and "ready to go live" ignores them until those features exist.**
   The alternative is to answer them as plain text now and move them later (double work).
2. **Industry extra questions.** The requirement lists seven examples (hotel or homestay, travel agent, clinic, car dealer, school or coaching,
   wedding planner, real estate) and "any other business: none". **I build all seven, as plain data in code, with simple answer types.**
   Tell me if your industry list differs.
3. **Time zone and default country.** Decision R35 says F16 adds the "default country" setting, which the phone matching of contacts uses (India
   for now), and opening hours need a time zone. **I add both as a small last slice: `GET` and `PUT /knowledge/settings` with `timeZone` and
   `defaultCountry`, stored in a table the knowledge module owns, starting at Asia/Kolkata and India; contacts read the country through the
   knowledge module's `index.ts`.** The alternative is to leave both until the setup wizard (F31).
4. **When does an answer count as confirmed?** **An answer a manager types or changes is confirmed straight away. "Please check" applies
   only to answers filled in by the system (the website reader, F31), which stay unconfirmed and unused until the manager taps Yes.**
   (F16 has no pre-filling, so every answer in F16 is a typed, confirmed one.)

## Scope
- In: tables `business_answers` and `situations`; the question set in code (general A to H and the industry extras) with each question's
  `key`, `section`, `text`, `type`, `options`, `needed_to_go_live`, `used_for` (and `prefill_from` as data for F31); answer validation for each
  answer type; reading and writing answers; confirming; the situations (E1 to E7) with their choices; the completeness score and the
  go-live readiness check (pure functions); activity-log lines and events; (slice 4) time zone and default country.
- Out: reading a website or listing to pre-fill (F31, with the website reader of F18); documents, FAQs, unanswered questions, "these don't match"
  (F18); offerings and offers (F17); the AI using the answers (F19); the setup chat (F31); the screens (designer); competitors beyond storing the
  links (F33 uses them); embeddings and search (R29: none to start).

## Rules (proposed)
- **Answer types** (each has its own validator): short text, longer text, pick one, pick several, yes/no, weekly hours, list (rows), price (paise),
  link, file reference (not accepted in F16: uploads are F18). Texts have maximum lengths; pick answers must be among the options (or "Other" with
  words); weekly hours are valid times, closing after opening; links are http or https; the GST number is checked for the right shape.
- An answer has a `status` of `confirmed` or `check`, a `source` (`typed` now; `website`, `listing`, `document` later) and who and when it was
  confirmed. Only `confirmed` answers are ever given to the AI (a function that returns them, tested, so F19 cannot pick up an unconfirmed one).
- **Unknown question keys are 404**; a question from another industry's extra set is 404; an answer the type does not allow is 400.
- Only managers write answers and situations; staff read. A business can only answer its own questions (the account comes from the session).
- **Needed to go live:** the general questions marked "Yes" in the requirements (A1, B1 to B6) plus the C1/C2 rule once F17 exists. The readiness
  check lists what is missing. F16 only reports it; the gate that stops going live is F36.
- **Completeness score:** a percentage of all answerable questions answered, shown with the missing ones that matter most (needed-to-go-live first),
  computed in code (the AI never does maths).
- **Situations E4, E5, E6 are fixed** (the requirement says so): shown, not changeable (PUT answers 400). E1, E2, E3 and E7 have the choices in the
  requirement; the first is the default, so a new business has sensible handling without answering anything.
- Answers can include customer-facing words and the business's address and phone. They are business data, not personal data of customers, but the
  activity log and events still carry **question keys only**, never the values.
- Removing an answer is not offered (clearing it is a PUT with an empty value for an optional question); nothing here deletes rows.

## API (at most 2 routes per slice)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/knowledge/questions` | Staff | The business questions for this business's industry, with answers, sources, status, the completeness score and the go-live readiness |
| PUT | `/knowledge/answers/{question_key}` | Manager | Answer or change one question (typed, so confirmed) |
| POST | `/knowledge/answers/confirm` | Manager | Confirm answers that are waiting for a check (one or many) |
| GET | `/knowledge/situations` | Staff | The seven situations and the chosen handling |
| PUT | `/knowledge/situations/{key}` | Manager | Change how one situation is handled |
| GET, PUT | `/knowledge/settings` | Staff read, manager write | Time zone and default country (slice 4, if you agree to question 3) |

`/knowledge/prefill`, documents, FAQs, unanswered questions and conflicts in `API.md` belong to F31 and F18, not here.

## Database (migration `014_knowledge.sql`)
- `business_answers`: `account_id`, `question_key`, `value` jsonb, `source`, `source_ref`, `status` (`check`, `confirmed`), `confirmed_by`, `confirmed_at`,
  actor stamps; one row per business and question (unique); RLS forced; the app role cannot delete.
- `situations`: `account_id`, `situation_key`, `choice`, `custom_text`; one row per business and situation; RLS forced.
- (slice 4) migration `016_business_default_country.sql` adds `accounts.default_country` (see the slice 4 notes: no separate settings table).
- The question list itself is code, not a table (the requirement: "new questions are added by us, not by businesses"), so it can be tested and versioned.

## Slice plan (each at most 2 routes; you test each in Postman before the next)
| Slice | What | Routes |
| --- | --- | --- |
| 0 | Migration `014`, table types, shared words and shapes, the question set (general A to H + 7 industries) and the situations as code, answer validators (pure, unit-tested), empty `core.knowledge` module | none; done |
| 1 | Read the questions with score and readiness; answer one | `GET /knowledge/questions`, `PUT /knowledge/answers/{question_key}`; done, owner tested |
| 2 | Confirm answers (for the system-filled ones that will come in F31) | `POST /knowledge/answers/confirm`; done, owner tested |
| 3 | Situations | `GET /knowledge/situations`, `PUT /knowledge/situations/{key}`; done, owner tested |
| 4 | Time zone and default country; contacts use the country | `GET /knowledge/settings`, `PUT /knowledge/settings`; done, owner tested |
| 5 | Team journey (several real people, every feature so far), the consistency checker, simultaneous-request tests, `api-security` review, hand-off with the manual test script | none; done, owner approved 12 Nov 2026 |

## Slice 0 notes (found while building)
- **The seven industries and the industries table.** The requirement's seven example industries did not all exist in the industries table.
  **Owner decision (12 Nov 2026): add common industries so a business can pick them at sign-up.** Migration `015_more_industries.sql` adds
  `restaurant_cafe`, `travel_agent`, `wedding_planner`, `car_dealer`, `auto_service`, `salon_spa` and `gym_fitness`, so the table now has
  15 (with `general`, `hotel_resort`, `real_estate`, `clinic`, `education`, `services`, `retail` and `other`). The extra questions apply to
  `hotel_resort`, `travel_agent`, `clinic`, `car_dealer`, `education`, `wedding_planner` and `real_estate`; the rest get the general questions.
  A test fails if an industry with extras is ever missing from the table. Extras for restaurant, auto service, salon and gym are not in the
  requirement; they can be added later as data, with the owner's wording.
- The question list is 26 general questions: 22 answerable here and 4 answered elsewhere (`offerings`, `current_offers`, `common_questions`,
  `brochure_upload`). Seven are needed to go live here (`has_website`, `business_name`, `business_summary`, `address`, `contact_details`,
  `opening_hours`, `customer_languages`); `offerings` is needed too but is left out of the check until F17.
- The primary key of `business_answers` is `(account_id, question_key)` and of `situations` is `(account_id, situation_key)` (one row each), so
  there is no id column.
- `situations` keeps only the chosen `choice` (no `custom_text`): the requirement lists choices only, and nothing needs free words yet.

## Slice 1 notes
- **The business's industry reaches the module through the signed-in person.** The knowledge module must not read the `accounts` table (the auth
  module owns it), and `core.knowledge` cannot require `core.auth` (a later slice has contacts read the default country from knowledge, and
  auth already requires leads, which requires contacts: that would be a loop). So `Principal` now carries `industryId`, loaded with the session
  (one extra join in `findLivePrincipal`), and the extras of the question list follow it. Changing a business's industry takes effect on the
  next request.
- `PUT` answers `{ question, progress }` so the screen can show the new score without a second request.
- A typed answer replaces the row (source `typed`, confirmed now, by the person); sending the stored answer again writes nothing.
- Question keys in the address are codes, not business records, so there is no "other business's id" for `PUT`; `test/isolation.test.ts` has an
  attempt (B answers the same question, A's answer must stay as it was) and a list check for `GET`.

## Slice 2 notes
- `POST /knowledge/answers/confirm` takes `{ "questionKeys": [ ... ] }` (1 to 100, each a question key) and is **all or none**: a key that is not one of the
  business's questions, or that has no answer yet, answers 404 and confirms nothing. A key already confirmed is left as it is (200, and it is not in
  `confirmed`). A key sent twice counts once. It answers `{ confirmed, progress }`, and writes one log line and one event only when something was
  really confirmed (question keys only, never the answers). The answer keeps its source (`website`, ...) and gains who confirmed it and when.
- **Nothing creates a waiting answer yet** (the website reader is F31). The tests plant one directly in the database. In Postman, folder 6 of the F16
  collection has a one-line SQL snippet that plants a waiting answer (`minimum_order_or_advance`) for your business, so you can see a real confirm.
- A manager who types an answer that is waiting for a check replaces it with a typed, confirmed one (slice 1).

## Slice 3 notes
- `GET /knowledge/situations` gives the seven situations in the fixed order, each with its words, its choices (the ready-picked first), `fixed`,
  `selectedChoiceKey`, `isDefault` and `updatedAt`. A business that has never chosen has no row and gets the first choice, so nothing needs to be
  set up and every new business already has sensible handling.
- `PUT /knowledge/situations/{key}` takes `{ "choice": "<choice key>" }`. Unknown situation: 404. The three fixed ones (complaint, exact price, unknown
  answer): 400 `SITUATION_FIXED`. A choice that is not one of that situation's own: 400 `INVALID_CHOICE`. Choosing the way that already applies
  writes nothing (no row, no log line). Only managers may change; the log line holds the situation key, the event holds the key and the choice (both
  codes, never free words).
- A saved choice that a later version of the product removes falls back to the default (a tested rule), so the AI never reads a way of handling
  that does not exist. `custom_text` from the plan is not built: the requirement lists choices only.
- The Postman folder is created with the Postman tools one request at a time, so it sits after folder 6 as "7. Situations".

## Slice 4 notes (a change from the plan, found while building)
- **One home for each setting.** The plan said a new `business_settings` table owned by the knowledge module. But the business already has a time zone
  (`accounts.time_zone`, from F01, shown by `GET /me`), so a second table would hold two time zones that can disagree. Instead the **default country
  is added to the same table** (`accounts.default_country`, migration `016`, default `IN`), and both settings stay on the business, which the sign-in
  module owns.
- **How the other modules read them.** `Principal` now carries `timeZone` and `defaultCountry`, loaded with the session on every request (the same
  trick as `industryId` in slice 1). Contacts read `principal.defaultCountry` instead of a fixed `IN` (decision R35), so **contacts need no
  dependency on the knowledge module**. Changing the country takes effect on the next request.
- **How they are changed.** `GET /knowledge/settings` (staff) and `PUT /knowledge/settings` (manager) live in the knowledge module, as agreed. The write
  goes through `createBusinessSettingsService` exported from the auth module's `index.ts`; `core.knowledge` therefore `requires` `core.auth`. There is no
  loop: nothing requires knowledge.
- `PUT` takes `timeZone` (a real IANA name, else 400) and/or `defaultCountry` (two letters, small letters become capitals; a country phone numbers do not
  exist for is 400 `INVALID_COUNTRY`). `{}` is 400 `NOTHING_TO_CHANGE`; sending the values already set writes nothing. One log line
  (`business.settings_changed`, setting names only) and one event. Phone numbers already stored are not touched: the country only matters when a
  number is typed without a country code.
- Test: a number typed without a country code is stored with India's code for an Indian business and the UAE's for one set to AE, and a number with its
  own code is the same for both.

## Changes made later by F17 (12 Nov 2026, owner's choice)
"What do you sell?" now counts and is answered by the offerings (a business needs one that is switched on to be ready to go live); the GST question
moved to "answered in Offerings"; `GET /knowledge/questions` gained `elsewhereStatus` on each question. See the F17 brief, slice 5.

## Reused from the hotel agent
The "Port from" table in PHASE-1.md has no row for F16. The old agent has `locations.office_hours` (migration 014: `{ allDay: true }` or
per-day open and close, `NULL` when not set up, and the agent says nothing about hours). I reuse that shape for the weekly-hours answer (B5).
The old code asks nothing like this fixed question list, so the list, the answer types and the completeness score are new.

## Tests (planned)
- Unit: every answer type accepts good values and refuses bad ones; weekly hours; GST shape; the completeness score; the go-live readiness; "only
  confirmed answers" function; the question set has unique keys, every industry's set is well-formed.
- API, every route: works / 401 / 403 (wrong role) / 404 (unknown key; another business's data can't be named) / 400.
- Specific: a typed answer is confirmed; a business can not answer another industry's extra question; situations E4 to E6 can not be changed;
  nothing personal or valuable is logged (keys only); the AI-facing function never returns an unconfirmed answer.
- Isolation: an entry for every route in `test/isolation.test.ts` (it fails if one is missing).

## Known limits to watch (R39 to R45)
None of them blocks F16. R42 (contacts and `staff_own`) does not apply to the profile. R44 (npm audit) is checked at the start.

## Slice 5 notes: the team journey and the consistency checker
Owner request (12 Nov 2026): a full journey with real people of different roles, and proof that the database stays connected and free of duplicates, so
the lead engine is a solid base for other developers and later modules. Built, with no new routes:
- `test/support/team.ts`: real people with their own sign-in and session (`signUpOwner`, `addTeamMember`).
- `test/support/consistency.ts`: **11 rules** read from the whole business in the database (duplicate contacts, lifecycle stage versus leads, pipeline shape,
  leads and tickets pointing at another business, done/closed agreement, answers and situations valid for the industry, stamps naming real people, every
  creation logged and announced exactly once, no personal data in the log or events). A test damages the data behind the app's back and proves the
  checker notices each kind of damage.
- `test/team-journey.test.ts`: "a busy day at Nair Stays" with a manager, a second manager, a staff member, an "own leads only" person and an outsider
  (about 90 steps), then sign-out and switching a person off; plus five simultaneous-request tests (same phone, same lead, nine leads shared out,
  ten changes to one ticket, two managers answering one question).
- `docs/TESTING.md`: how the layers fit together and what to add with a new route, table or feature.
- **Finding R46** (see REQUIREMENTS-REVIEW.md): deleting a contact leaves its open lead on the board with no contact. Pinned by a test; the owner decides.

## Security checklist
Reviewed with the `api-security` skill on 12 Nov 2026 (the whole F16 diff: 7 routes, 2 tables, migrations 014 to 016, plus the `Principal` change).

- [x] Every new table has account_id, RLS enabled + forced, and the schema test passes (`business_answers`, `situations`; `accounts` gained a column).
- [x] Every new route: role guard (`staff` for reads, `manager` for writes) and tests for works / 401 / 403 wrong role / 404 / 400. The question, situation and settings
  routes name codes from lists in code, not business records, so there is no "other business's id" to try; the nearest cases are tested (another industry's
  question is 404; B answering the same question leaves A's answer as it was, in `isolation.test.ts`).
- [x] staff_own: the profile and settings are business-wide by nature (reads for everyone, writes for managers); tested for all three roles.
- [x] No business id taken from body, query or params; the business and its industry, time zone and country come from the session; every body is
  `.strict()` or a fixed shape.
- [x] All input validated with zod with maximum lengths; the answer checks refuse bad links, GST numbers, hours, picks and lists; no SQL built from strings
  and the knowledge module has no raw SQL.
- [x] New public route / webhook / tool / outside call / upload: none.
- [x] Nothing personal in the log or events: only question and situation keys and setting names; the consistency checker scans the whole log for the
  names, phones and emails of the business's contacts and people.
- [x] An answer that is waiting for a check can never reach the AI: the `onlyConfirmedAnswers` function is the only way F19 will read answers (unit-tested).
- [x] Cross-module access only through `index.ts` (auth exports the business-settings service; `core.knowledge` requires `core.auth`, no loop).
- [x] `process.env` is read only in `kernel/config.ts`; `npm audit --audit-level=high` shows no high or critical finding (10 moderate, as before).
- [x] `npm run verify` parts that exist today pass (see the hand-off message).

Known limits (tracked in docs/REQUIREMENTS-REVIEW.md R39 to R46): disabled people can still be owners (R39); malformed body gets 400 before 401 (R40);
contacts and `staff_own` (R42); the open lead of a deleted contact (R46, new). The website reader, documents and FAQs are F18 and F31.

## Decisions and differences from the requirements
- The question list is code, not a table (the requirement: new questions are added by us). 26 general questions (22 answerable here, 4 answered in
  offerings, FAQs and documents) and the extras of seven industries; the industries table gained seven everyday industries (migration `015`).
- A typed answer is confirmed at once; "Please check" is only for answers the system fills in later (F31). Confirming is all-or-none.
- Situations E4, E5 and E6 are fixed as in the requirement; the others start on their first choice. `custom_text` is not built.
- The time zone and default country sit on the business (one home each), and the signed-in person carries them with the industry.
- Offerings, FAQs, documents, the website reader, competitors' use and the AI's use of the answers are later features (F17, F18, F31, F33, F19).

## Manual test script
The screens are parked for the designer, so F16 is tested through the API.

**A. Postman (recommended).** Collection *Toobler One - F16 business profile (run in order)* and environment *Toobler One - local dev* (a verified **manager**).
1. `npm run db:migrate` (014, 015 and 016 must be applied), restart `npm run dev`.
2. Run the collection with the Runner, folders 0 to 8 in order. Every request checks its answer; all must pass. For a real "confirm", run the one-line SQL in the
   description of folder 6 first. It leaves your business in India, with its answers filled in.

**B. By hand, the main path.**
1. Sign in as a manager. `GET /knowledge/questions` lists the 26 general questions (plus your industry's extras), all unanswered, 0 percent, not ready to go live.
2. `PUT /knowledge/answers/business_name` `{"value":"Nair Stays"}`: confirmed, progress up. Answer the other six "needed to go live" questions: `readyToGoLive` becomes true.
3. Send a bad answer (a link that is not a link, three picks where two is the most): 400 `INVALID_ANSWER` with a plain message. Send the same answer twice: the second writes nothing.
4. `GET /knowledge/situations`: seven situations, the first choice picked. `PUT /knowledge/situations/discount_request` `{"choice":"prices_are_fixed"}`; try
   the fixed `complaint`: 400 `SITUATION_FIXED`.
5. `PUT /knowledge/settings` `{"defaultCountry":"AE"}`, then add a contact with a phone typed as `0501234567`: it is stored as `+971501234567`. Set it back to `IN`.
6. As a **staff** member, every `PUT` and `POST` of the knowledge module is 403, every `GET` is 200. Signed out: 401.
7. Database: one log line per change (`knowledge.answer_saved`, `knowledge.situation_changed`, `business.settings_changed`) with keys only, never the answers.

**C. The team journey:** `npx vitest run team-journey isolation` (about 5 seconds) tells the whole busy day and checks the database afterwards.
