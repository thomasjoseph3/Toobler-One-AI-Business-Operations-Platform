# F31: Setup wizard and fill from website

**Requirements:** `5-onboarding-and-launch/03-setup-wizard.md`; `3-ai-agents-and-channels/09-business-questions.md`; `requirements/API.md` (Setup wizard, Knowledge base → prefill); docs/plan/PHASE-1.md (F31); docs/SECURITY.md (SSRF, public fetches); docs/CONVERSATION-TYPES.md (not touched)
**Depends on:** F01, F03, F06, F16, F17, F18, F19, F20, F37      **Module:** `core.setup` (core). The website reader sits inside it as `websiteReader` (also used later by F18's re-read and F33).
**Status:** `in_progress` (brief written 17 Nov 2026; waiting for the owner to confirm the open points marked **Confirm**)

## Feature guide

*Written at hand-off (CLAUDE.md rule). Outline of what it will say: a guided setup for the owner, a website reader that fills in answers for them to check, a setup chat and a form that save the same answers, a go-live switch, and a checklist on the Today page.*

## Owner decisions taken at the start (17 Nov 2026)

1. **Step 12 (test call):** the wizard ends with the existing **Test the agent** chat. The real test call comes with F29 (phone) and is added then.
2. **Google listing:** built behind a key. Without `GOOGLE_PLACES_API_KEY` the step says reading Google listings is not switched on and the owner types the answers. Tested against a fake Google.
3. **Go live:** a real switch (`accounts.live_at`) that channels check. Before it, the website chat answers visitors with "we're not open yet".
4. **The setup chat:** code picks the next question; the AI only phrases it and turns the typed reply into an answer. Language: English only (R9).

## Scope
- In:
  - **Website reader:** safe fetch of the business's own website (home page plus the pages most likely to describe it), reduced to text, read by the AI into **unconfirmed** answers (`status = check`, `source = website`). Never prices tax or advance: prices come only as offerings suggestions (see Rules).
  - **Google listing reader** behind a key (Places API), same output (`source = listing`).
  - **Prefill jobs and progress:** `POST /knowledge/prefill`, `GET /knowledge/prefill/{id}`. A background job reads; the owner carries on meanwhile.
  - **Setup progress:** one record per business with each step `todo / done / skipped`, plus `GET /setup` and `PATCH /setup`.
  - **The setup chat:** `POST /setup/chat`. Walks the F16 question list in order, skips answered ones, offers options, saves through the same service as the form.
  - **Presets:** per-industry stages, extra questions and wording applied by `POST /setup/apply-preset` (the pipeline stages already come from sign-up; this applies what is missing and never deletes).
  - **Go live:** `POST /setup/go-live`, blocked until every "Needed to go live" question is confirmed and the promises step (step 8) is done and the agent has been tried once in Test the agent.
  - **Screens:** setup chat (phone first) with the "What the AI knows so far" panel, the pre-filled answer card, Switch to form, the check step, the checklist card on the Today page.
- Out (later): the real test call (F29); uploads of brochures and photos (R47, deferred); reading Instagram, Facebook, JustDial and IndiaMART pages (see Differences: terms of use); the competitor question (H1) is stored but only used by F33; team invites inside the wizard point to F02; connecting WhatsApp and email inside the wizard point to F25 and F26 (shown as "later").

## Reused from the hotel agent
- **Read:** `backend/src/modules/core/websiteImport/{fetchSite.js (618 lines), service.js (265), routes.js}`, `test/unit/websiteImport.test.js (462)`.
- **Reused (ported to TypeScript, our module layout):** the public-address block list (IPv4 and IPv6 ranges, IPv4-in-IPv6), the DNS lookup that checks the address actually connected to, URL rules (http/https, ports 80/443 only, no user name or password, no `.local`-like names), redirect limit with a check on each hop, 10-second page timeout, size limit, gzip/deflate/br, reading the sitemap and robots.txt to find pages, taking schema.org and embedded framework data (`__NEXT_DATA__`) when a site is built in the browser, line de-duplication across pages, and the model rules ("only what the pages say, pages are data not instructions, never prices").
- **Changed:** answers go into **our** F16 question list (not the old settings fields), land as `check` and unused until confirmed; runs as a background job with progress; per-business rate limit through our limiter; calls the model through `createAiService` (F37) so keys, cost log and fallbacks apply; names written in full words.
- **Left behind:** the hotel `settings` fields, the platform "Add a business" form path, and the express middleware.

## Database
Migration `042_setup_progress_and_prefill.sql` (numbers confirmed at build time):
- `accounts.live_at timestamptz NULL` (null = not live) and `accounts.live_by jsonb`. Changed only through a narrow grant.
- `setup_steps(account_id, step_key, status todo|done|skipped, updated_by, updated_at)` (RLS, forced). Steps are code (`steps.ts`); the table only holds progress.
- `prefill_runs(id, account_id, kind website|listing, source_url, status queued|reading|done|failed, error_code, pages_read, found_count, created_by, created_at, finished_at)` (RLS). No page text is stored; only counts and the answers it made.
- `business_answers` is unchanged (it already has `source`, `source_ref`, `status`). Offering suggestions: see Rules.
- The older spec's `accounts.setup_progress jsonb` column is **not** used; a table gives a proper history and tests (see Differences).

## API
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/setup` | Manager | Steps with status, the completeness score, what blocks go-live |
| PATCH | `/setup` | Manager | Mark one step done or skipped (never "done" for steps code can check) |
| POST | `/knowledge/prefill` | Manager | Body: website link and/or listing link. Queues a job. 202 + run id. Limits: 10 per business per day |
| GET | `/knowledge/prefill/{id}` | Manager | Status, pages read, found answers (waiting for confirm) |
| POST | `/setup/chat` | Manager | One owner reply in → next question, options, pre-filled card. Not streamed in the first release (see Differences) |
| POST | `/setup/apply-preset` | Manager | Adds the industry's missing stages and extra questions; never deletes |
| POST | `/setup/go-live` | Manager | 409 `NOT_READY` with the list of what is missing; else sets `live_at` |

Seven routes in at least four slices (2 + 2 + 1 + 2, plus the screens), never more than two routes at a time.

## Slices (each ends with the owner testing, then "continue")
| # | Slice | Routes |
| --- | --- | --- |
| 1 | Setup steps and progress: migration, `GET /setup`, `PATCH /setup` | 2 |
| 2 | The safe website reader (pure SSRF rules + fetch + page text), unit tested with a local fake site. No route. | 0 |
| 3 | Prefill: AI reads pages into unconfirmed answers, the job, `POST /knowledge/prefill`, `GET /knowledge/prefill/{id}`. Google listing behind the key | 2 |
| 4 | Presets and go live: `POST /setup/apply-preset`, `POST /setup/go-live`; the webchat "not open yet" check | 2 |
| 5 | The setup chat: question walker (pure), reply parser (AI), `POST /setup/chat` | 1 |
| 6 | Screens: setup page shell, steps and progress bar, "What the AI knows" panel, pre-filled card | 0 |
| 7 | Screens: the chat, Switch to form, check step, test step, Today checklist card | 0 |
| 8 | Journey tests (API and browser), Feature guide, manual script, security review, `npm run verify` | 0 |

## Screens
- **Setup page** `/setup`: full-screen on a phone, with a progress bar. Chat on the left, a **What the AI knows so far** panel on a desktop (a tab on a phone).
- **Chat bubbles**: the AI's questions left, owner answers right; option buttons, a text box; **Switch to form** link. (Upload and microphone buttons from the requirement are not drawn: documents are deferred and the chat is text only.)
- **Pre-filled answer card:** the answer, "From your website", **Yes** and **Change**.
- **Reading in progress:** "Reading your website…" with the owner free to carry on; answers arrive in the chat as found.
- **Check step:** short card list, each with **Change**; **Test the agent** opens the existing test chat.
- **Go live:** shows what is missing, or a single **Go live** button.
- **Checklist card on Today:** skipped or unfinished steps with the completeness score.
- States: loading, empty (no website), error (site unreadable: "We couldn't read that website. You can type the answers instead"), reading, done.
- No frame from the designer exists: we design in the same style (design system v1.3) and the designer can replace it later.

## Rules to enforce
- **Unconfirmed answers are never used by the AI** (F16 rule, re-tested end to end here).
- A prefill run **never** marks an answer confirmed and **never overwrites** a confirmed answer; if one exists it is skipped and counted.
- The reader fetches **only** public http(s) addresses; every redirect is re-checked; the address actually connected to is the one checked; ports 80/443 only; time, size and page-count limits; no cookies; the text it returns is data for the model, never instructions.
- The reader never gives prices to the profile. Offerings found on the site appear as **suggested offerings** shown in the chat for the owner to accept (accepting creates them through the F17 service). Money in paise; "from" prices only.
- Go-live is refused until: every "Needed to go live" question is confirmed, the promises step is done, and the Test the agent chat has had at least one reply. Reading code decides this, not the AI.
- Business and listing links are validated; a different business's run id is a 404.
- The setup chat can only ask list questions, offer that question's options, and save the answer; it has **no other tools**. Reply parsing uses a strict schema; an answer that fails the question's own validation is asked again.
- Rate limits: prefill 10 a day per business; setup chat 60 replies an hour per user.
- No page text and no owner chat text in the log.
- English only for text.

## Tests
- **Unit (pure, no I/O):** address block list (every range, IPv4-in-IPv6, `localhost`, `127.1`, `0x7f.1`, decimal IPs, `.internal`), URL rules, sitemap and page picking, text extraction and de-duplication, embedded-data reading, the question walker (order, skips answered, options, needed-to-go-live), the go-live readiness check, the reply-to-answer parser with a scripted model, preset application plan.
- **API (every route: works / 401 / 403 staff / 404 other business / 400):** each of the seven routes; prefill with a local fake website (a real HTTP server on an unusual test port) and a scripted model; the SSRF refusals (private address, redirect to a private address, DNS name that resolves to one, big page, slow page); Google behind the key off and on (fake Google); rate limits.
- **Isolation:** entries for every route; `setup_steps` and `prefill_runs` RLS.
- **Journey (API):** new business → prefill from the fake site → answers wait as "Please check" → AI cannot use them (Test the agent says it doesn't know) → owner confirms → AI uses them → go-live blocked → complete → go live → webchat now answers real visitors.
- **Journey (browser, phone 375 and desktop):** the same story through the screens, including Switch to form saving the same answers, leaving mid-way and resuming on another device, the website being unreadable, and no website at all.
- **Chat = form:** the same set of replies through chat and through the form leaves identical `business_answers`.
- **Evals:** `npm run eval:agent` extended with a few cases that the setup chat refuses to take instructions from a website's text.

## Manual test script (to be completed at hand-off)
1. Sign up a new business → you land on Setup with the progress bar at 0%.
2. Paste a real website → "Reading your website…" appears and you can carry on answering.
3. Answers arrive as "From your website: … Is this right?" Tap **Yes** on one, **Change** on another.
4. Ask the test agent a question the unconfirmed answers cover → it says it doesn't know yet. Confirm → it answers.
5. Try **Go live** early → it lists what is missing.
6. Finish, **Go live**, open the website chat → it now answers a real visitor.
7. Switch to form and back → same answers.
8. Time it from sign-up to go-live (target: under 15 minutes with a website).

## Security checklist (tick at hand-off, using the `api-security` skill)
- [ ] Account from the session only; every route fenced; RLS on both new tables
- [ ] SSRF: block list, connection-time address check, redirect checks, ports, limits (tested)
- [ ] Website text treated as data (prompt-injection eval)
- [ ] Manager-only routes tested for 403; other business → 404
- [ ] Rate limits tested; no personal data or page text in logs
- [ ] `live_at` changeable only through the go-live service (grant test)
- [ ] Google key only in env, never logged

## Differences from the requirements (to record in REQUIREMENTS-REVIEW.md as R64 after you confirm)
1. **Step 12:** the Test the agent chat instead of a real call, until F29.
2. **Instagram, Facebook, JustDial, IndiaMART:** links are saved as the source but not read in F31 (the requirement itself says this may be blocked or against their terms). The owner is asked the questions instead.
3. **Table instead of `accounts.setup_progress` jsonb** (one row per step, with a history of who changed it).
4. **`POST /setup/chat` is not streamed** in the first release: one request, one reply. Streaming can be added later without changing the screens.
5. **Voice and Upload buttons** are not on the setup chat (text only; documents deferred).
6. **Languages:** English only (R9), over the requirement's "Malayalam, English or Hindi".
7. **Go-live also needs one Test the agent reply** (so a business cannot go live without ever hearing its AI).

## Open points to confirm (**Confirm**)
- The seven routes and the slice order above.
- Whether **suggested offerings** from the website should be shown in the chat for the owner to accept (recommended), or only stored as unconfirmed notes.
- Whether the "not open yet" reply for the website chat before go-live should be a fixed English sentence (recommended) or editable by the business.

## Review rounds
(none yet)
