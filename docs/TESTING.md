# Testing: how the lead engine is kept honest

Everything here runs with `npm test` (a throwaway local Postgres, never the dev database). Read this before adding a route or a
module, so your work joins the same safety net.

## The layers
| Layer | Where | What it proves |
| --- | --- | --- |
| Unit | `*.test.ts` next to the code (`helpers/`) | Pure rules: scoring, the open-lead rule, answer checks, completeness |
| Route tests | `apps/api/test/<feature>.test.ts` | Each route: works, 401, 403 (wrong role), 404 (other business), 400 (bad input) |
| Journey tests | `apps/api/test/*-journeys.test.ts` | One feature told as a story, in a pretend browser with real cookies |
| **Team journey** | `apps/api/test/team-journey.test.ts` | **Several real people with different roles run one business together, across every feature**, then the consistency checker reads the whole business |
| **Isolation suite** | `apps/api/test/isolation.test.ts` | Business B can never reach business A, through any route or any table. **It fails when a route has no isolation decision.** |
| Schema tests | `schema.test.ts`, `fence.test.ts` | Every business table has forced row-level security |

## The helpers (apps/api/test/support)
- `team.ts`: `signUpOwner` (real sign-up), `addTeamMember(owner, { name, role })` (a real person with their own sign-in, session and
  cookies; added to the database directly until the invite route exists in F02). Each person has `send`, `ok(method, url, body, status)` and
  `refused(method, url, body, status)`.
- `consistency.ts`: `findConsistencyProblems(database, businessId)` lists every fact about one business that does not add up (duplicates, wrong
  lifecycle stages, leads and tickets pointing at another business, missing log lines, personal data in the log, ...). An empty list is the goal.
- `app.ts`, `auth.ts`, `browser.ts`, `harness.ts`: the app, a signed-in person, a pretend browser, the database.

## When you add something
1. **A route:** write its route test; add an attempt (or an exemption with a reason) in `isolation.test.ts`, or `npm test` fails.
2. **A table:** it must have `account_id` and forced RLS (the schema test checks). If rows of it can disagree with other tables, add a rule to
   `consistency.ts` (a function that returns the problems in plain words, added to the `checks` list), and add a line to the "damage" test so the
   rule is proven to notice something.
3. **A feature that people use together:** add its steps to the story in `team-journey.test.ts` (as the right person, in the right chapter), and end
   the chapter with `expect(await problemsOf(anita)).toEqual([])`.
4. **Something that two people can do at once** (create, close, reassign): add it to "many people at once": fire it with `Promise.all` and check
   that nothing is duplicated and nothing is lost.
5. **A known limit you decide not to fix now:** write it in `docs/REQUIREMENTS-REVIEW.md` (an R-row with a proposed solution) and pin today's
   behaviour with a test that says so (see "known limit R46"), so fixing it later is a deliberate change.

## What is not tested yet
Screens (parked for the designer), the invitation flow (F02), the AI agent and the channels (later features).
