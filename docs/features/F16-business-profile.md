# F16: Business profile, business questions and situations

**Requirements:** `3-ai-agents-and-channels/09-business-questions.md`, `08-knowledge-base.md` (the Business profile and Situations parts); `requirements/API.md` (Knowledge base); docs/plan/PHASE-1.md (F16)
**Depends on:** F00, F01     **Module:** `core.knowledge` (core: always on, no switch; later features F17, F18 and F19 add to it)
**Status:** in progress. Slice 0 built (12 Nov 2026). The owner chose all four defaults ("your defaults") and said "go".

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
- (slice 4) `business_settings`: `account_id` (one row), `time_zone`, `default_country`.
- The question list itself is code, not a table (the requirement: "new questions are added by us, not by businesses"), so it can be tested and versioned.

## Slice plan (each at most 2 routes; you test each in Postman before the next)
| Slice | What | Routes |
| --- | --- | --- |
| 0 | Migration `014`, table types, shared words and shapes, the question set (general A to H + 7 industries) and the situations as code, answer validators (pure, unit-tested), empty `core.knowledge` module | none; **built, owner review pending** |
| 1 | Read the questions with score and readiness; answer one | `GET /knowledge/questions`, `PUT /knowledge/answers/{question_key}` |
| 2 | Confirm answers (for the system-filled ones that will come in F31) | `POST /knowledge/answers/confirm` |
| 3 | Situations | `GET /knowledge/situations`, `PUT /knowledge/situations/{key}` |
| 4 | Time zone and default country (if agreed); contacts use the country | `GET /knowledge/settings`, `PUT /knowledge/settings` |
| 5 | Journey tests, an entry for every route in `test/isolation.test.ts`, `api-security` review, Postman collection, hand-off with the manual test script | none |

## Slice 0 notes (found while building)
- **The seven industries and the industries table.** The requirement's seven example industries do not all exist in the industries table (it
  has `general`, `hotel_resort`, `real_estate`, `clinic`, `education`, `services`, `retail`, `other`). Extras are keyed by industry id: the
  sets for `hotel_resort`, `clinic`, `education` and `real_estate` apply today; the sets for `travel_agent`, `car_dealer` and
  `wedding_planner` are written but take effect only when the platform adds those industries (a platform admin `POST /industries`). `services`,
  `retail`, `general` and `other` have no extras (as "any other business" in the requirement).
- The question list is 26 general questions: 22 answerable here and 4 answered elsewhere (`offerings`, `current_offers`, `common_questions`,
  `brochure_upload`). Seven are needed to go live here (`has_website`, `business_name`, `business_summary`, `address`, `contact_details`,
  `opening_hours`, `customer_languages`); `offerings` is needed too but is left out of the check until F17.
- The primary key of `business_answers` is `(account_id, question_key)` and of `situations` is `(account_id, situation_key)` (one row each), so
  there is no id column.
- `situations` keeps only the chosen `choice` (no `custom_text`): the requirement lists choices only, and nothing needs free words yet.

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

## Security checklist (to fill in at hand-off)
