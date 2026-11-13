# F18: FAQs, unanswered questions and knowledge search

**Requirements:** `3-ai-agents-and-channels/08-knowledge-base.md`; `requirements/API.md` (Knowledge base); docs/plan/PHASE-1.md (F18)
**Depends on:** F00, F01, F16, F17      **Module:** `core.knowledge` (the existing core module: always on, no switch)
**Status:** approved by the owner on 13 Nov 2026 (slices 1 to 6 built and tested; documents on hold, R47). `requirements/API.md` updated at the owner's request (R48).

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
Toobler One's AI answers customers only from what the business has told it. This feature is where the business tells it things, and where the AI learns what it is still missing. It has three parts:

1. **FAQs.** Short questions with their answers, typed by anyone on the team ("Do you have parking?" / "Yes, free for guests."). The AI uses them to answer customers.
2. **Unanswered questions.** When a customer asks something the AI has no answer for, the AI says it will check with the team and writes the question on a list, with how many times it was asked. Anyone on the team can **answer** it (the answer becomes an FAQ at once) or **ignore** it.
3. **Search.** The way the AI (and the team, to try it out) finds the right FAQ for a customer's question, even when the customer uses different words or makes a typing mistake.

### Why it is useful
- **The AI gets better every week without anyone "training" it.** The team only answers real questions that real customers asked. Each answer is typed once and used in every future conversation, on every channel.
- **Everyone gives the same answer.** Staff and the AI use the same FAQs.
- **The team sees what customers actually want to know.** A question asked six times this month ("Is there EV charging?") is a clear sign of what to add or offer.
- **Nothing is made up.** If nothing matches, the AI does not guess; it says it will check, and the question lands on the list.

### How it works: a day in the life
1. The manager adds FAQs when setting up: parking, breakfast, check-in time.
2. At 11 PM a customer asks on WhatsApp: "Is there any EV charging for my car?" The AI searches the FAQs and finds nothing. It tells the customer the team will get back to them, and logs the question.
3. Over the week, other customers ask "Is EV charging available?", "Available EV charging?" and so on. Each time the count goes up.
4. Every night at 02:30 UTC (08:00 in India) the system tidies the list: questions that are the same question in different words are joined into one with the full count.
5. On Monday anyone on the team opens **Unanswered questions** and sees "Available EV charging? (asked 3 times)". They type "Yes, two chargers in the basement" and tap **Answer**. It is now an FAQ.
6. The next customer who asks about EV charging gets the real answer, and staff can see which FAQ it came from.
7. If the team later removes that FAQ, the question goes back on the list, so it is never forgotten.

### Who can do what
Every signed-in person, whatever their role (manager, staff, or the "own leads only" role), can add, edit and remove FAQs, see the unanswered list, answer or ignore questions, and try the search. Nobody outside the business can see any of it.

### Settings and limits
| What | Value |
| --- | --- |
| An FAQ's question / answer | Up to 300 / 2,000 characters |
| Two FAQs with the same question | Not allowed (capitals and extra spaces are ignored) |
| Search results | 5 by default, at most 10 |
| When the nightly tidy-up runs | Every day at 02:30 UTC. It is one line in the knowledge module (`MERGE_SIMILAR_QUESTIONS_SCHEDULE` in `module.ts`), changed by a developer. |
| What the tidy-up joins | Only questions with **exactly the same meaningful words**. "Is parking available?" and "Available parking?" are joined; "price of room 101" and "price of room 102" are never joined. |
| Personal details in questions | Emails and phone numbers a customer typed are replaced with `[email]` and `[number]` before the question is saved. |

### What it will never do
- Use an FAQ that is removed, or one that is still waiting for a check.
- Show one business's FAQs or questions to another.
- Guess: when nothing matches, the answer is an empty list.
- Write the words of a question or answer into the activity log or the events (they hold ids only).

### Not part of this feature (on hold)
Uploading documents (PDF, Word, photos), reading them, "These don't match" warnings and "Re-read website" are on hold until the end of Phase 1 (decision R47). The screens for FAQs and unanswered questions arrive with the designer's work.

### For the tech team
- **Module:** `core.knowledge` (`apps/api/src/modules/core/knowledge`), always on. Layers as everywhere: `routes/` → `services/` → `repositories/` → database; pure logic in `helpers/`.
- **Tables:** `faqs` (question, answer, `status` confirmed/check, `source` typed/website/unanswered, soft delete, generated `search_vector`, two partial indexes); `unanswered_questions` (one row per question per business, `group_key`, `count`, `answered_at`/`faq_id`/`ignored_at`, `merged_into_id`). All have `account_id`, forced row-level security, and the app role cannot delete rows. Migrations `019` to `022`.
- **Routes (all `staff` access, i.e. every role):** `POST/GET /knowledge/faqs`, `PATCH/DELETE /knowledge/faqs/{id}`, `GET /knowledge/unanswered[?include=history]`, `POST /knowledge/unanswered/{id}/answer`, `POST /knowledge/unanswered/{id}/dismiss`, `GET /knowledge/search?q=&limit=`.
- **For the AI agent (F19), through `core.knowledge`'s `index.ts`:** `createUnansweredQuestionsService(...).logUnansweredQuestion(accountId, actor, text)` and `createKnowledgeSearchService(...).searchKnowledge(accountId, text, limit)`.
- **Search:** Postgres full-text search (English configuration; filler words dropped; any one meaningful word matches) plus `pg_trgm` word similarity (threshold 0.45, set per transaction) for typos. Question words weigh more than answer words. Keyword search was chosen over vectors on purpose (no embeddings cost, easy to explain); the whole search is one query in `faqs.repository.ts` behind `searchKnowledge`, so vectors could replace it later without touching callers.
- **Logging a question:** one atomic `INSERT ... ON CONFLICT (account_id, group_key) DO UPDATE SET count = count + 1`, so simultaneous asks are all counted. If the row was joined into another by the nightly job, the ask is counted on the row it was joined into.
- **Nightly job:** `knowledge.merge_similar_questions` (cron in the manifest) lists every business via `JobRun.listAccountIds()` (added to the kernel for this; ids only) and queues `knowledge.merge_similar_questions_for_business` for each. That job locks the business's open questions, computes each question's "word key" (stemmed meaningful words, sorted) in SQL, and `chooseQuestionMerges` (pure, unit-tested) decides the groups. The most asked question stays and takes the total count and latest time; the others get `merged_into_id` and disappear from lists. Safe to run twice. The job runs as actor `system` / `knowledge.merge_similar_questions_for_business`; failures are retried by pg-boss with growing waits.
- **Events and log:** `faq.created/updated/deleted`, `unanswered_question.logged/answered/ignored` (ids only); activity-log kinds `knowledge.faq_*`, `knowledge.unanswered_question_*`, `knowledge.unanswered_questions_merged`.
- **Errors (shared shape `{ error: { code, message, details? } }`):** `FAQ_EXISTS` (409, with the existing FAQ's id), `NOTHING_TO_CHANGE` (400), `UNANSWERED_QUESTION_NOT_OPEN` (409), plus the usual 400/401/404; another business's id is always 404.
- **Profile link (F16):** "Anything else customers often ask?" (`common_questions`) reports `done` once the business has a confirmed FAQ.

### Known limits
- The nightly tidy-up only joins questions with identical meaningful words. Looser matching ("EV charging" vs "EV charger") is left out on purpose to avoid joining different questions; revisit with real data.
- A question joined overnight disappears from the list: someone who had it open on screen and answers it gets "not found" and should refresh.
- A reworded `[number]` placeholder may appear in a question; the team can fix the wording when answering.
- No screens yet (designer); everything is tested through Postman and automated tests.

---

**Goal in one line:** the AI answers from what the business has told it. The owner types **FAQs** (question and answer). When a customer asks something the AI cannot
answer, the question is logged under **Unanswered questions**; the manager answers it once and it becomes an FAQ, so the AI knows it from the next conversation.
A **search** finds the right FAQ for a customer's question, and says where the answer came from.

## Owner decision (13 Nov 2026): documents are on hold
Uploading documents (PDF, Word, phone photos), reading them, the file storage, "Use this / Don't use", the "These don't match" warnings and "Re-read website" are **not part of F18 now**.
The owner will decide at the end of Phase 1 whether to build them (see R47 in REQUIREMENTS-REVIEW.md and the "Deferred work" row in STATUS.md). Because of that:
- no file storage, no new package, no file-reading jobs, no `knowledge_documents` table;
- the search is built so passages from documents can be added later without changing how it is called (it works on a general "passages" table, today filled only from FAQs).

## What the owner sees (later, when the screens arrive)
Knowledge base → **FAQs**: a list of questions and answers; add, edit, remove (asks "Are you sure?"). Knowledge base → **Unanswered questions**: the questions the AI could not
answer, grouped, with how often each was asked; **Answer** (it becomes an FAQ) or **Ignore**.

## Questions for the owner (my default in bold)
1. **Route addresses.** `API.md` puts them under `/knowledge/...`. **Use `/knowledge/faqs`, `/knowledge/unanswered`, `/knowledge/unanswered/{id}/answer`, `/knowledge/unanswered/{id}/dismiss`
   exactly as `API.md` says.**
2. **Who may do what.** **Owner decision (13 Nov 2026): anyone signed in (every role) may add, edit and remove FAQs, see the unanswered questions and answer or ignore them.** This is wider than `API.md`
   (which said managers only); `API.md` is to be updated to match.
3. **A search route?** `API.md` has no search route (the AI calls a function). **Add one small staff-readable route, `GET /knowledge/search?q=`, so you can try the search in Postman today and
   F19's "Test the agent" can reuse it.** It returns passages and their source, nothing else. The alternative is no route and testing the search only through automated tests.
4. **Does a new FAQ need "Please check"?** Typed FAQs are the owner's own words, so **they are usable at once** (the requirement's "Please check" is for pre-filled and uploaded items). FAQs drafted
   from a website (F31) will arrive as "Please check" later, so the table has a `status` (`confirmed`, `check`) now; only `confirmed` reaches search.
5. **Same question twice.** **Two live FAQs may not have the same question (ignoring capitals and extra spaces): 409**, so the AI never has two answers to one question.
6. **Grouping unanswered questions.** The requirement says "grouped nightly". **Group at once when the AI logs a question (same question after tidying up capitals, spaces and punctuation: one row, count
   +1), and add a nightly job in the last slice that merges near-duplicates ("Is there EV charging" / "do you have ev charger").** The alternative is only the nightly job.

## Scope
- In: tables `faqs`, `unanswered_questions`, `knowledge_passages` (the search index); the routes below; the function the AI will call to log an unanswered question (called by F19, tested now); the search
  function (Postgres full-text plus trigram, behind one function so vectors could be added later); the pure "tidy a question for grouping" function; activity-log lines and events; isolation entries;
  the team journey grows a chapter.
- Out: documents, file storage, file reading, conflicts and the trust order between documents and typed answers, "Re-read website" (all on hold, R47); the AI's `search_knowledge` and
  `log_unanswered_question` tools (F19; the functions they call are ready); the screens (designer); the three-monthly review reminder (needs documents and alerts, F23).

## Rules (proposed)
- An FAQ: `question` (1 to 300), `answer` (1 to 2000), `status` (`confirmed`, `check`), `source` (`typed`; later `website`, `unanswered`), actor stamps, soft delete. Anyone signed in may write (owner decision).
- Typed or answered-from-unanswered FAQs are `confirmed`. **Only `confirmed`, live FAQs are ever searchable**; removed ones disappear from search at once.
- An unanswered question: `question` as first asked (1 to 300), `group_key` (the tidied form), `count`, `last_asked_at`, `answered_at`, `faq_id`, `ignored_at`. Asked again after being answered or ignored: a new
  open row is not started while an FAQ answers it (answered ones stay as history); an ignored question that is asked again stays ignored but its count still rises.
- Answering needs the answer text (and may edit the question); it creates the FAQ and closes the unanswered row **in one transaction**; answering twice is 409.
- Search never leaves the business: the account comes from the session or the conversation, never from input. A search with no good match returns an empty list, never a guess.
- Personal data: a customer might type a phone number into a question. The AI function **stores the question text only after the AI's own tidy-up rules (no digits runs longer than 6, no emails)**; ids and
  field names only in the log and events (never the question or answer words).
- The AI states facts; it never does maths (nothing in F18 does any).

## API (at most 2 routes per slice)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| POST | `/knowledge/faqs` | Staff (anyone) | Add an FAQ |
| GET | `/knowledge/faqs` | Staff | The list, newest first; `?status=check` for the ones waiting for a check |
| PATCH | `/knowledge/faqs/{id}` | Staff (anyone) | Edit the question or answer |
| DELETE | `/knowledge/faqs/{id}` | Staff (anyone) | Soft delete (removes it from search) |
| GET | `/knowledge/unanswered` | Staff (anyone) | Open questions, grouped, most asked first; `?include=history` for the answered and ignored ones too |
| POST | `/knowledge/unanswered/{id}/answer` | Staff (anyone) | Answer it; it becomes an FAQ |
| POST | `/knowledge/unanswered/{id}/dismiss` | Staff (anyone) | Ignore it |
| GET | `/knowledge/search` | Staff | `?q=`: the matching FAQ passages with their source (decision 3) |

## Database (migration `019_knowledge_faqs.sql`, further ones as the slices need)
- `faqs` (soft delete, actor stamps, partial unique index on the tidied question among live rows, length checks, RLS forced, the app role cannot delete).
- `unanswered_questions` (account, `group_key`, count, timestamps, optional composite foreign key to `faqs (account_id, id)`; unique on account and `group_key` while open).
- `knowledge_passages` (account, `source_kind` (`faq` for now), `source_id`, `text`, a `tsvector` column and a trigram index; RLS forced). Kept in step with `faqs` by the service in the same transaction.
- Extensions `pg_trgm` and `unaccent` (already listed in docs/ARCHITECTURE.md); check they are present locally.

## Slice 1 notes
- Migration `019_knowledge_faqs.sql` (the `faqs` table; applied to the dev database). `POST /knowledge/faqs` and `GET /knowledge/faqs` are open to every signed-in role (owner decision). Question spaces are tidied, answers keep line breaks.
- Tests: `apps/api/test/faqs.test.ts` (15 cases), plus isolation entries.

## Slice 2 notes
- `PATCH /knowledge/faqs/{id}` changes the question, the answer, or both (nothing to change: 400 `NOTHING_TO_CHANGE`; same values again: no change and no log line; a question another live FAQ has: 409 `FAQ_EXISTS`).
  `DELETE /knowledge/faqs/{id}` is a soft delete (204; the second time 404) and frees the question for a new FAQ. Both are open to every role. Unknown, removed and other businesses' ids are all 404.
- Errors use the shared shape `{ "error": { "code", "message", "details"? } }` everywhere; no new error types were needed.

## Slice 3 notes
- Migration `020_knowledge_unanswered_questions.sql`: one row per question per business (unique on the tidied "group key"); answered means it points at an FAQ of its own business; never both answered and ignored (database checks).
- The AI's function is `createUnansweredQuestionsService(...).logUnansweredQuestion(accountId, actor, text)`, exported through `core.knowledge`'s `index.ts` for F19. It tidies the text (spaces, emails and phone numbers of 7+ digits blanked out as `[email]`/`[number]`, cut to 300),
  groups by lower case without punctuation (letters of every script are kept, including combining marks such as Malayalam vowel signs) and counts a repeat in one statement, so two customers asking at once are both counted. Only a new question writes a log line and an event.
- `GET /knowledge/unanswered` (every role): the open ones, most asked first; `?include=history` adds the answered and ignored ones. There is no route to add a question: only the AI does that (F19), so Postman shows an empty list until a row exists (see the hand-off SQL).
- To do in slice 4: when an FAQ made from a question is removed, the question must become open again, otherwise the AI would be left with no answer and no entry to answer.

## Slice 4 notes
- `POST /knowledge/unanswered/{id}/answer` (body: `answer`, optional reworded `question`) creates a usable FAQ (source `unanswered`) and closes the question as answered, in one transaction; answers 201 with the FAQ.
  `POST /knowledge/unanswered/{id}/dismiss` ignores an open question and answers 200 with it. Both are open to every role. Unknown and other businesses' ids are 404. A question that is not open (answered or ignored) is 409 `UNANSWERED_QUESTION_NOT_OPEN`; a question an FAQ already has is 409 `FAQ_EXISTS`.
  Two people acting at the same moment take turns (row lock), so only one wins.
- Removing an FAQ opens again every question it answered, so the AI never has a question with no answer and no entry to answer. An ignored question is not reopened by being asked again (its count still rises); to bring one back, add an FAQ by hand.
- The steps "add a usable FAQ" and "turn a clashing question into 409" are written once in `services/faq-steps.service.ts` and used by the FAQ service and the unanswered questions service.

## Slice 5 notes
- **Keyword search, not vectors** (owner agreed, 13 Nov 2026): FAQs are short, English-only and written by the business, so Postgres full-text search plus trigram matching is enough. The whole search sits in `searchKnowledge` (service) and one query (repository); vectors would change only those if the AI evals (F19) ever show missed questions.
- **Change from the brief:** no separate `knowledge_passages` table. The search reads `faqs` directly (migration `021_knowledge_search.sql` adds a generated `search_vector` column and two partial indexes, and the `pg_trgm` extension). A copy of every FAQ would have needed keeping in step on add, edit, remove and status change, for nothing until documents exist; if they are ever built, their passages join the same search.
- How it matches: filler words ("do you have") are dropped; any one meaningful word is enough, in any form (park, parking, parked); a word with a typo still matches ("parkng"); question words count more than answer words. Only confirmed, live FAQs are found. Nothing matching gives an empty list, never a guess.
- `GET /knowledge/search?q=&limit=` (every role; limit 1 to 10, default 5) answers `{ items: [{ sourceKind, sourceId, question, answer, score }] }`. The AI (F19) calls `createKnowledgeSearchService(...).searchKnowledge(accountId, text)` through the module's `index.ts`. Search text is always passed as a bound value, never built into SQL.
- Two test findings fixed on the way: filler words alone matched any FAQ that contained them (typo matching now uses only the meaningful words), and the default typo threshold missed "parkng" (lowered to 0.45 for the search).

## Slice 6 notes: the safety net
- **Nightly tidy-up:** migration `022_knowledge_merge_questions.sql` adds `merged_into_id` (a joined question points at the one that stays, same business, never itself, hidden from every list and from answer/dismiss, which then answer 404). `JobRun` gained `listAccountIds()` (kernel change, ids only, wired in `server.ts`) because a scheduled job has no business of its own. The job is declared in `module.ts` (the module-structure rule has no `jobs/` folder) and calls `mergeSimilarQuestionsForBusiness` in the unanswered-questions service.
- **Strict merge rule (decision):** only identical sets of meaningful words are joined. A fuzzier rule would be easy to build and risks joining different questions ("room 101" / "room 102").
- **F16 link:** `common_questions` is now answered elsewhere (`done` with a confirmed FAQ, `not_done` without), so the profile total no longer leaves it out (`knowledge.test.ts` changed on purpose: 32 - 3).
- **Consistency checker:** new rule "FAQs and unanswered questions are in order" (no two live FAQs with one question; an answered question points at a live FAQ; no open question points at an FAQ; never both answered and ignored; no chains of joined questions; counts at least one); FAQs and unanswered questions join "every creation is logged and announced once", "every stamp names someone of the business" and the personal-words scan. Two new damage cases prove it notices.
- **Team journey chapter 5c:** the AI cannot answer EV charging asked in several words; the nightly tidy-up joins them; the own-leads-only person answers, the staff member ignores another; search finds the new FAQ; the profile question turns `done`; removing the FAQ reopens the question; an outsider sees none of it.
- **Verification:** `npm run verify` green (78 test files, 1,056 tests, 94 browser tests). `npm audit --audit-level=high`: 10 moderate, none high or critical (as before F18). F18 adds no package. There are no F18 screens, so there was no browser walk-through.

## Slice plan (each at most 2 routes; you test each in Postman before the next)
| Slice | What | Routes |
| --- | --- | --- |
| 1 | Migration for FAQs, add an FAQ, list FAQs | `POST /knowledge/faqs`, `GET /knowledge/faqs` |
| 2 | Edit and remove an FAQ | `PATCH /knowledge/faqs/{id}`, `DELETE /knowledge/faqs/{id}` |
| 3 | Unanswered questions: table, the AI's logging function (unit and service tested), the grouped list | `GET /knowledge/unanswered` |
| 4 | Answer (becomes an FAQ) or dismiss | `POST /knowledge/unanswered/{id}/answer`, `POST /knowledge/unanswered/{id}/dismiss` |
| 5 | Search: passages table kept in step with FAQs, the search function, the test route | `GET /knowledge/search` |
| 6 | Nightly merge job, consistency rules, isolation entries, team-journey chapter, `api-security` review, Postman collection, hand-off | none; **built, owner review pending** |

## Reused from the hotel agent
The old agent kept FAQs as one JSON column on the business (`faqs` in `hotel/business/repository.js`) with no search and no unanswered-question log. Nothing is ported; what is reused is the idea that
the agent reads the FAQs as business facts. We use a real table because FAQs need their own search, status, history and the unanswered-question loop. The website reader row of the "Port from" table is on hold with documents.

## Tests (planned)
- Unit: tidy-a-question (capitals, spaces, punctuation, a long number is removed); the search ranking helper.
- API, every route: works / 401 / 403 (wrong role) / 404 (another business's id) / 400.
- Specific: duplicate FAQ question is 409; a removed FAQ is not found by search; a `check` FAQ is not found by search; answering an unanswered question creates exactly one FAQ and answering twice is 409;
  the same question logged twice is one row with count 2; the log and events hold no question or answer words; two simultaneous adds of one question make one FAQ.
- Consistency checker: no two live FAQs with one tidied question; every passage points at a live FAQ; an answered unanswered row points at an FAQ of its own business.
- Isolation: an entry for every route in `test/isolation.test.ts`; search by business B never returns A's passages.

## Known limits to watch (R39 to R47)
R39 (disabled people) and R42 (own-leads role) are not touched. R44 (`npm audit`) is checked at the start. R47 (documents on hold) is this feature's own decision.

## Security checklist
Reviewed with the `api-security` skill on 13 Nov 2026 (the whole F18 diff: 8 new routes, 2 jobs, 2 tables and a column, migrations 019 to 022, the kernel change to `JobRun`, and the knowledge-profile change).

- [x] Every new table has account_id, RLS enabled + forced, and the schema test passes (`faqs`, `unanswered_questions`). The app role cannot delete rows and can change only named columns.
- [x] Every new route: role guard (every route is `staff` = any signed-in role, by the owner's decision) and tests for works / 401 / 404 other business / 400 bad input. There is no 403 case because there is no role that is refused; this is tested ("open to every role").
- [x] staff_own: FAQs and unanswered questions are business-wide for every role (owner decision), not filtered per person.
- [x] No business id taken from body, query or params; every body and query is `.strict()`; the business comes from the session, and in the AI and job code from the caller (the agent runtime, the job payload).
- [x] All input validated with zod with maximum lengths. Raw SQL is only the two fixed queries (search, and the nightly word keys); the customer's text is always a bound value, never part of the SQL text (tested with quotes, `;`, `&`, `|`, `%`).
- [x] No public route, webhook, outside call or upload added.
- [x] Nothing personal in the log or events: only ids and field names; the request log strips query strings (so search text is never logged); emails and phone numbers in a customer's question are blanked before saving; the consistency checker scans the whole log and events for FAQ and question words.
- [x] The AI can read only confirmed, live FAQs (search); removed and waiting-for-check FAQs are never found (tested).
- [x] Cross-module access only through `index.ts`: nobody imports the knowledge module's inside. `core.knowledge` requires only `core.auth` and `core.offerings`.
- [x] Cross-business work: the only one is `listAccountIds` (ids of all businesses, nothing else), used by the scheduled job to queue one job per business; each of those runs in that business's fence. It is wired in `server.ts` with a comment saying why.
- [x] Simultaneous requests: adding a FAQ takes a per-business lock; editing, answering and ignoring lock the row; the count of a question goes up in one statement; the nightly job takes a per-business lock. All tested with `Promise.all`.
- [x] `process.env` is read only in `kernel/config.ts`; `npm audit --audit-level=high` shows no high or critical finding (10 moderate, as before F18); no package added.
- [x] Full verification: `npm run verify` green (gate, format, lint, typecheck, 78 test files / 1,056 tests, 94 browser tests).

## Decisions and differences from the requirements
- Owner (13 Nov 2026): documents, file reading, conflicts, "Re-read website" and the three-monthly review reminder are on hold until the end of Phase 1 (R47).
- Owner (13 Nov 2026): FAQs and unanswered questions can be used by every signed-in role, not managers only (R48 lists the difference from `API.md`; `API.md` is not edited unless the owner asks).
- Owner (13 Nov 2026): keyword search, not vectors.
- Build decisions (mine, for the owner to change): no `knowledge_passages` table (the search reads `faqs`); an extra route `GET /knowledge/search`; the nightly tidy-up joins only identical meaningful words; the clean-up runs daily at 02:30 UTC; `JobRun` got `listAccountIds()`; a typed FAQ is usable at once.
- The six defaults near the top of this file were accepted by the owner as the work went on.

## Manual test script
There are no F18 screens yet (the designer is working on them), so it is tested through Postman.

**A. Postman (recommended).** Collection *Toobler One - F18 FAQs and unanswered questions (run in order)* and environment *Toobler One - local dev* (any verified person).
1. `npm run db:migrate` (019 to 022 must be applied) and restart `npm run dev`.
2. For folder 4 you need two open unanswered questions. Only the AI creates them (F19), so add two once in the Supabase SQL editor (your business id comes from `GET /api/v1/me`):
   ```sql
   begin;
   select set_config('app.account_id', '<your business id>', true);
   insert into app.unanswered_questions (id, account_id, question, group_key, count) values
     (gen_random_uuid(), '<your business id>', 'Is there EV charging?', 'is there ev charging', 6),
     (gen_random_uuid(), '<your business id>', 'Do you allow pets?', 'do you allow pets', 3);
   commit;
   ```
3. Run the folders in order with the Runner: 0 sign in, 1 add and list, 2 refusals, 3 edit and remove, 4 unanswered questions, 5 search. Every request checks its answer; all must pass.

**B. The nightly tidy-up** cannot be started from Postman (it runs by itself at 02:30 UTC). Its behaviour is proved by automated tests:
`npx vitest run unanswered-questions choose-question-merges team-journey` (the journey's chapter 5c tells the whole story: several wordings of one question, the tidy-up, answering, searching, removing the FAQ and the question coming back).

**C. By hand, the main path.** Add an FAQ ("Do you have parking?"); search `?q=where can I park my car` and see it; search `?q=parkng` and see it; ask for something unrelated and see an empty list; answer an unanswered question and search for it; remove that FAQ and see the question come back on `GET /knowledge/unanswered`.
