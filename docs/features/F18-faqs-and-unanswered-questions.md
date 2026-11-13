# F18: FAQs, unanswered questions and knowledge search

**Requirements:** `3-ai-agents-and-channels/08-knowledge-base.md`; `requirements/API.md` (Knowledge base); docs/plan/PHASE-1.md (F18)
**Depends on:** F00, F01, F16, F17      **Module:** `core.knowledge` (the existing core module: always on, no switch)
**Status:** in progress (13 Nov 2026). Slice 1 built and tested by the owner in Postman (13 Nov 2026). Slice 2 built, owner test pending.

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
| GET | `/knowledge/unanswered` | Staff (anyone) | Open questions, grouped, most asked first; `?include=answered` for history |
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

## Slice plan (each at most 2 routes; you test each in Postman before the next)
| Slice | What | Routes |
| --- | --- | --- |
| 1 | Migration for FAQs, add an FAQ, list FAQs | `POST /knowledge/faqs`, `GET /knowledge/faqs` |
| 2 | Edit and remove an FAQ | `PATCH /knowledge/faqs/{id}`, `DELETE /knowledge/faqs/{id}` |
| 3 | Unanswered questions: table, the AI's logging function (unit and service tested), the grouped list | `GET /knowledge/unanswered` |
| 4 | Answer (becomes an FAQ) or dismiss | `POST /knowledge/unanswered/{id}/answer`, `POST /knowledge/unanswered/{id}/dismiss` |
| 5 | Search: passages table kept in step with FAQs, the search function, the test route | `GET /knowledge/search` |
| 6 | Nightly merge job, consistency rules, isolation entries, team-journey chapter, `api-security` review, Postman collection, hand-off | none |

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
To be ticked at hand-off with the `api-security` skill.

## Decisions and differences from the requirements
- Owner (13 Nov 2026): documents, file reading, conflicts and "Re-read website" are on hold until the end of Phase 1 (R47).
- Proposed defaults above (questions 1 to 6) are to be confirmed or changed by the owner.

## Manual test script
To be written at hand-off. Slice by slice, each slice's Postman steps are given when it is built.
