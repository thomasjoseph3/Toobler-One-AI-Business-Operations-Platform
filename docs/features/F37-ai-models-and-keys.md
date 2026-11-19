# F37: AI models and keys

**Requirements:** none of its own. It serves every AI feature (F15 router, F19 agent, F20 to F26 channels, F31 setup chat, later voice). Decisions: R49 (this feature, LangChain and LangGraph, built before F15) and R22 (the AI library, closed).
**Depends on:** F01 (sign-in, platform admin, mail sender), F03 (modules). **Module:** `core.ai` (core, always on), plus `apps/api/src/providers/llm/`.
**Built before F15** (owner decision, 13 Nov 2026) so F15 and F19 only ask for "the model for this job".

## Feature guide

### What it does
One place decides **which AI model does which job, which keys pay for it, and what happens when something stops working**. Every AI feature
of the product (sorting conversations, replying in chat and WhatsApp, reading and drafting emails, summaries, the setup chat, reading a
website) asks this place for "the model for this job". Nothing else ever talks to Gemini, OpenAI or Claude.

### Why it is useful
- **Any model, by setting.** Gemini, OpenAI (GPT) and Claude are in. A new model, or a new version of one, is added in the admin list, not in code. A company
  that retires a model costs one edit.
- **Small, cheap models for simple jobs.** Each job has its own ordered list: first choice, then fallbacks. Sorting a conversation, reading an email
  and replying in chat start with a small, quick model. The setup chat and reading a website start with a stronger one.
- **Your keys or ours.** A business can use **its own** keys (it pays its AI company), or the **platform's** keys (you lend them for a demo), or its own first
  and the platform's as a back-up. Either way, a business can save several keys; they take turns, and one that runs out of quota rests for a while.
- **Demos cannot run up a bill.** The platform's keys come with a **monthly cap** (calls) and an **end date**, set per business by the platform team.
- **You hear before customers do.** Every night the system tests the platform's keys and every business's own keys, and checks which models the AI companies
  still offer. A rejected key, a model that has gone, and a model about to retire (30 and 7 days ahead) each send **one email**
  to the right person: the business's managers for its own keys, the platform team for the platform's keys and models.
- **You can see what happened.** Every call is written down (no words, no keys): which job and agent asked, which model and key answered, whether a
  fallback was needed and why, how many tokens were used (including those the AI company served from its cache), and how long it took.

### A day in the life (Nair Stays)
Anita, who manages Nair Stays, opens **AI settings**. Nothing works yet. The platform team gives Nair Stays a trial: the platform's keys, 300 calls a month,
ending in 30 days. Anita chooses "platform keys". Later she saves her own two Gemini keys, tests them (one tiny real call each, answered in about a second)
and switches to "my keys first, then the platform's". One busy afternoon her main key hits its quota: the AI quietly uses her backup key, the main key shows
as **resting**, and the status page says so. That night the check finds her main key has been switched off at Google: it is marked **failed** and she gets one email
naming the key by the label she gave it. She removes it (its secret is wiped from the database) and adds a new one.
She decides replies should start with GPT-4o mini, so she sets her own order for "replying to customers"; every other job still follows the platform's order.
Meanwhile the platform team sees that Gemini 3.5 Flash-Lite retires in 5 days: it gets one email, replaces the model in the jobs that use it, and marks it retired.

### Who can do what
| Person | Can |
| --- | --- |
| **Manager** of a business | Save, list, test and remove the business's own keys; choose the key mode; set the business's own model order for a job; see usage, the call log and what is running now |
| **Platform admin** (Toobler team) | Switch the platform's keys on or off for a business, with a monthly cap, an end date and warning emails on or off; add models, mark them deprecated or retired, set the date a company retires one; set the platform's model order for each job; see the health of the platform's own keys |
| **Staff** (any other role) | Nothing here. The AI simply works for them. |

### Settings, limits and defaults
| Thing | Value |
| --- | --- |
| New business | Uses its own keys only; no platform access; warning emails on |
| Key modes | `own`, `platform`, `own_then_platform` (own keys first, the platform's only if they all fail) |
| Keys per AI company, per business | Up to 10; the same key cannot be saved twice |
| Platform keys | `GEMINI_API_KEYS` (comma list), `OPEN_AI_API_KEY`, `CLAUDE_API_KEY` in the server's `.env`; a company with no key is simply unavailable |
| Monthly cap | Answered calls on the platform's keys per month (UTC); failed calls and a business's own keys do not count; empty means no cap; 0 means none allowed |
| Time limit per try | 30 seconds; then the next model or key is tried |
| A key that hit a limit | Rests 1 minute (a burst) or 30 minutes (the day's quota); a rejected key rests 1 hour |
| Models per job in a business's own order | 1 to 8 |
| Call records kept | 90 days; the daily totals are kept for good |
| Nightly check | 02:15 UTC (platform keys, models, retirement dates, then each business's own keys); fallback watch every hour; clean-up 02:45 UTC |
| Warning emails | One per problem, a reminder a day while it lasts; retirement dates and new models are announced once |
| Test button | 10 a minute from one address (each is a real call) |

### What it never does
Never shows a key after it is saved (only `••••3f9a`). Never logs a key, a prompt or an answer, and the call record holds neither. Never lets one business use
another's keys, see its usage or touch its settings. Never lets a business give itself the platform's keys or lift its own cap. Never runs a call past a cap or an
end date. Never lets a bug swap a stored key for another (the database refuses; the only change allowed is wiping it when it is removed).

### What is not part of it
- **Voice calls** (Gemini Live, GPT realtime) stream audio and need their own adapter (F29); they will use the same keys, caps, health and emails.
- **The agents** that use it (F15 router and classifier, F19 text agent, the channels) and the **screens** (waiting for the designer; this feature is API and Postman first).
- **A price table** (tokens to rupees) and **the full staff alerts** system (F23): only these warning emails, sent through the existing mail sender.
- **Trying new models automatically.** The nightly check *tells* the platform team about new models; a person adds and tests them.

### For the tech team
**Where.** `apps/api/src/providers/llm/` knows how to talk to the AI companies (LangChain), has no database and no idea of businesses. `apps/api/src/modules/core/ai/` is the
business side (keys, settings, caps, usage, health, routes). A lint rule keeps `@langchain/google-genai`, `@langchain/openai` and `@langchain/anthropic` inside `providers/llm`.

**How a call works.** A feature builds `createAiService({ database, config, llm })` and calls `generateText` or `generateObject` with `{ accountId, tag: { task, agentId, channel,
promptVersion, conversationId? }, prompt: { stableSystemText, changingSystemText?, messages } }`. The service reads the business's settings and keys (`loadAiAccess`), decides which key
sources may be used (`decideKeySources`: mode, platform on/off, end date, cap), picks the models for the job (the business's order, else the platform's, from `ai_task_models`; retired and
voice models skipped, deprecated ones last), builds the list of things to try (every key of a company on the first model, then the next model; own keys before platform keys), and
hands it to the provider, which tries them in order with a 30-second limit each. Afterwards it rests failed keys in memory, notes a change in an own key's health on the key, and writes the
call record and the day's totals. A failure to note health or record the call is reported but never fails the answer.

**Tables** (migrations 023 to 030): `ai_models`, `ai_task_models`, `ai_platform_key_checks` (shared, read-only for the app role); `ai_keys`, `ai_settings`, `ai_calls`, `ai_usage` (fenced by
`account_id`, forced RLS, column-level grants); `ai_notices_sent` (closed to the app role).

**Routes** (17): see "API".

**Jobs** (declared in `module.ts`, given the settings, database, mail sender and AI layer through the new `job.services`): `ai.check_health` (nightly), `ai.check_business_keys` (one per business),
`ai.check_fallbacks` (hourly), `ai.clean_old_calls` (nightly).

**Events** (ids and field names only): `ai.key_added`, `ai.key_removed`, `ai.settings_updated`, `ai.access_changed`.

**Commands:** `npm run ai:check` tries each platform key in `.env` with one tiny real call and lists what it can see (never prints a key).

### Known limits
- The monthly cap is checked before each call, so a burst of calls at the same moment can pass it slightly.
- Resting keys are remembered in the running API's memory (per copy), not in the database; the database keeps each key's status.
- The nightly test of a business's own keys costs a few tokens on that business's account.
- `SECRETS_ENCRYPTION_KEY` cannot be rotated yet: losing it means every saved key must be entered again (there is no re-encrypt tool).
- Prompt caching: the adapters put the steady part of a prompt first, mark it for Claude, and record the cached tokens; the prompt builder that fills `stableSystemText` arrives with F19, which
  adds the "stable start" test.
- **Not yet proven with the real company:** Claude (no key yet: only the unit tests cover its message building and cache marker), and Gemini prompt caching (0 cached tokens in the one real test: either Gemini did not cache that start or the library does not report it; OpenAI's caching works). The warning emails were checked with a recording mail sender, not delivered by real SMTP, and the 02:15 schedule was registered but not waited for.
- Gemini's own "list models" says a model exists even where a real call is refused (found with the owner's keys), so a model is only trusted after a test call.

## Scope
- In: the model layer on **LangChain** (`@langchain/core` and the three company packages); a list of models with kind, size, moving-name marker and retirement date; an order of models **per job** (developer preset, platform setting, business override);
  platform keys from `.env` and business keys encrypted in the database with rotation; key modes; the call record, daily totals and the cap; the nightly health checks and warning emails; platform-admin controls.
- Out (later): the live-voice adapter (F29); screens (designer); money maths; the agents (F15, F19); the full staff alerts (F23); **LangGraph** (vetted, installed with the first agent).

## Reused from the hotel agent
- Read: `src/agent/shared/model.js`, `keys.js`, `textAgent.js`, `modules/core/integrations/service.js`, `routes.js`.
- Reused: LangChain chat models with a primary model plus fallbacks; the **key pool** (rotate, rest a limited key for 1 or 30 minutes, rest a rejected key for an hour, label keys by position, never print them); the error readers (`isRateLimit`, `isBadKey`); the "shared platform source vs the business's own source" idea and the **Test connection** button.
- Changed: keys live in an encrypted table with a status, not plain fields on the business; many companies; key pools per business; a model list and per-job orders replace fixed model names in config; caps, end dates, usage records and health are new; TypeScript, repository pattern, the account fence.
- Left behind: LangChain inside the agent code (it moves behind `core.ai`); `GEMINI_API_KEY_2..10` (one comma list now, and the single name still works).

## Packages (vetted 13 Nov 2026 with `npm run vet`; exact versions; no install scripts)
| Package | Version | Weekly downloads | Age | Installed |
| --- | --- | --- | --- | --- |
| `@langchain/core` | 1.3.2 | 8.5 M | 14 days | yes |
| `@langchain/google-genai` | 2.3.4 | 1.0 M | 24 days | yes |
| `@langchain/openai` | 1.8.0 | 5.0 M | 16 days | yes |
| `@langchain/anthropic` | 1.6.0 | 1.9 M | 21 days | yes |
| `@langchain/langgraph` | 1.5.3 | 4.9 M | 17 days | no: arrives with the first agent (F15/F19) |
All MIT, from the LangChain organisation. Encryption uses Node's built-in `crypto` (AES-256-GCM): no package. `npm audit --audit-level=high`: still 10 moderate, none high (unchanged).

## Settings in `.env` (names only; validated at start-up; never logged)
- `GEMINI_API_KEYS`: one or more Gemini keys, comma-separated (`GEMINI_API_KEY`, one key, is still read).
- `OPEN_AI_API_KEY`: the OpenAI key (may also hold several, comma-separated). `CLAUDE_API_KEY`: optional.
- `SECRETS_ENCRYPTION_KEY`: 32 random bytes in base64 that scramble the keys businesses save. `npm run setup` adds it. Production refuses to start without it. **Back it up.**

## Database
- `ai_models` (shared): provider, model name, label, jobs it suits, status (`active|deprecated|retired`), kind (`text|voice`), size, `is_alias`, `retires_on`, display order. Ten models seeded (023, 024).
- `ai_task_models` (shared): `(task, position, model_id)`, the platform's order per job. Seeded by the developer (024); edited by the platform admin.
- `ai_platform_key_checks` (shared): what the nightly check found about each platform key, by position (029).
- `ai_keys` (per business): scrambled key, last four, keyed fingerprint, status, note, checked-at, last warning, soft delete (025). Migration 026: a trigger lets the stored key change only by the wipe at removal.
- `ai_settings` (per business): key mode, the business's own model order; and, written only by the platform: platform on/off, monthly cap, end date, warnings on/off (027).
- `ai_calls` (per business): one row per call, no text, no key, kept 90 days; `ai_usage` (per business): daily totals, kept (028).
- `ai_notices_sent`: which warning emails went out; closed to the app role (030).

## Tasks (a task is a kind of job; the app asks for a task, never a model name)
`classify_conversation` (F15), `analyse_email` and `draft_email` (F26), `chat_reply` (F19, F20, F25), `summarise` (F19), `setup_chat` (F31), `extract_from_website` (F31). Small, quick models first for the simple jobs,
a stronger one first for the setup chat and for reading websites. Voice calls will use a separate realtime model (F29). Each feature adds a task here when it needs one.

## API (17 routes; built in 9 slices of at most 2)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/ai/models` | manager | Jobs, models (with kind, size, moving name, retirement date, available for this business), the order set for each job, the order really tried today |
| POST | `/ai/keys` | manager | Save an own key (company, label, key). Encrypted; answers with the preview only |
| GET | `/ai/keys` | manager | Own keys: preview, status, note, last checked. Never the key |
| DELETE | `/ai/keys/{id}` | manager | Remove an own key and wipe its secret |
| POST | `/ai/keys/{id}/test` | manager | One tiny real call, up to three of the company's models: works / rejected / quota / no model / unreachable |
| GET, PUT | `/ai/settings` | manager | Key mode and the business's own model order; shows what the platform allowed (read-only) |
| GET | `/ai/usage` | manager | Calls, failures, fallbacks, tokens, cache hit rate, the platform cap used and left. `?from=&to=&groupBy=task\|agent\|channel\|model\|day` |
| GET | `/ai/status` | manager | Per job: the model expected first, what answered last, whether it is on a fallback; keys resting |
| GET | `/ai/calls` | manager | The call log, newest first. Filters: task, agent, channel, success; `limit`, `before` |
| GET, PUT | `/platform/businesses/{id}/ai-access` | platform | Platform keys on/off, monthly cap, end date, warning emails |
| GET | `/platform/ai/keys` | platform | Health of the `.env` keys by position |
| GET, POST | `/platform/ai/models` | platform | The model list with the platform's order per job; add a model |
| PATCH | `/platform/ai/models/{id}` | platform | Change a model: status, retirement date, jobs, size, kind, label, order |
| PUT | `/platform/ai/tasks/{taskId}/models` | platform | Set the platform's model order for one job |

## Slices (all built)
1. Model layer, `GET /ai/models`. 2. Own keys, save and list. 3. Remove and test a key. 4. Settings (key mode, own model order) and the call service using the business's own keys.
5. Platform control per business. 6. Usage, the cap and what is running. 7. Call log and platform key health. 8. Model list and job order (two slices of two routes). 9. Nightly checks, warning emails, clean-up.

## Rules enforced
- Only `providers/llm` imports the AI company packages (lint rule, proven to fire).
- Keys: encrypted at rest (AES-256-GCM, tied to the business), never returned, logged or put in an event, error or email; the database allows no change to a stored key except the wipe at removal.
- A business's keys serve only that business. The platform's keys serve a business only while switched on, before the end date and under the cap; otherwise 503 `AI_ACCESS_NOT_ENABLED`, `AI_ACCESS_ENDED` or 402 `AI_CAP_REACHED`.
- Fallback order: every key on the first model, then the next model; own keys before the platform's.
- Errors are clear and safe: 429 for a used-up quota, 502 `AI_FAILED`, 503 `AI_NOT_AVAILABLE`; no provider text.
- Warning emails: one per problem, a reminder a day; only to the right people; names a key by the label the manager gave it, escaped in the HTML.
- Platform routes act across businesses on the owner connection, named business in every query, guarded by `access: 'platform'`.

## Tests
- Whole suite: **106 test files, 1,346 tests** pass (it was 1,056 before F37), plus the 94 browser tests. `npm run verify` is green.
- Unit: key pool, error reader, fallback loop, the pure model-choice rules, key-source rules (mode, end date, cap), key-test findings, the secret box (round trip, tamper, wrong business, wrong secret), usage maths, model watching, the warning emails' wording, the call row.
- API: every route works / 401 / 403 / 404 (another business) / 400, isolation entries for every route, the app role cannot write what it must not (platform columns, stored keys, call records), keys appear in no response, log, event or email.
- Integration: the scripted AI company drives the real fallback loop, the real database recorder and the real jobs; `test/ai-journey.test.ts` tells the whole story in 9 chapters (no AI set up, a trial with a cap, own keys, a busy day, a rejected key and the nightly email, own model order and a platform change, a retiring model, numbers that agree everywhere, an outsider who sees nothing) and runs the consistency checker after each; the checker catches AI damage (removed key not wiped, totals not matching the call records, a model order naming a missing model, ...).
- Real companies (run by hand with the owner's keys on 13 Nov 2026; not part of the automated suite, to cost nothing): a structured answer from Gemini and from OpenAI (a complaint, confidence 0.98 and 0.95, in 1.6 s and 2.6 s); the nightly platform check against the real companies and the real development database (all 7 platform keys working; 4 new Gemini and 10 new OpenAI models noticed; nothing missing); the API starting with the four new jobs registered in the job queue with their schedules; OpenAI prompt caching proven (the second identical start was served 2,560 of 2,718 input tokens from cache). `npm run ai:check` repeats the key check at any time.

## Manual test script (Postman: collection *Toobler One - F37 AI models and keys (run in order)*)
1. Sign in as a manager. Run **1. List the jobs, the models...**: seven jobs, ten models, your platform keys make the Gemini and OpenAI models available only if the platform switched them on for you.
2. Folder **2**: save a made-up key (201, preview only); the same again (409); a bad one (400); list.
3. Folder **3**: test the made-up key (a real call to Google: *rejected*, key marked *failed*); remove it (204); again (404). Optional: save and test your real key (set `realGeminiKey` in the environment), see *works* with the model and time, then remove it.
4. Folder **4**: read settings; "own then platform"; choose your own models for chat replies; the three refused cases; put it back.
5. Folder **5** (make your user a platform admin first, one line of SQL): see the business's access, switch the platform keys on with a cap of 5 and a 30-day end, clear them, the refused cases.
6. Folders **6 and 7**: usage, split by job, a bad range, what is running, the call log, the platform keys' health. Empty until something uses the AI (the AI features arrive with F15 and F19); the automated journey test proves the numbers.
7. Folder **8** (platform admin; changes the shared list): list, add a made-up model, add it again (409), retire it, send the chat-reply order back unchanged.
8. In a terminal: `npm run ai:check` to see each of your `.env` keys answer for real.

## Security checklist (`api-security` review of the diff)
- [x] Every new business table has `account_id`, RLS enabled and forced, and a policy (`ai_keys`, `ai_settings`, `ai_calls`, `ai_usage`): the schema test enforces it. Shared tables are read-only for the app role; `ai_notices_sent` is closed to it.
- [x] Business work runs in the account fence; the account comes from the session or the job, never from input. Repositories filter by account and id.
- [x] Another business's key or id answers 404; the wrong role 403 (manager routes, platform routes); every route tested for works / 401 / 403 / 404 / 400, with isolation entries.
- [x] Platform routes use `access: 'platform'`; a business's own manager cannot read or change what the platform decided (tested). They work on the owner connection, naming the business.
- [x] Secrets: `SECRETS_ENCRYPTION_KEY` and the platform keys only in `.env` (validated, production refuses to start without the secret); business keys AES-256-GCM tied to the business; fingerprint is a keyed hash; previews are the last four characters; a database trigger blocks swapping a stored key; removal wipes it.
- [x] Logs and events: ids and field names only; tests scan the server log, the activity log, the events, the call records and the emails for keys and message text.
- [x] Input: every body, query and parameter validated with zod (`.strict()`, maximum lengths); Kysely parameters only; the grouping column comes from a fixed list.
- [x] Outside calls: provider addresses are fixed in code (no user-supplied URL, so no SSRF); keys travel in headers, never in addresses; every call has a time limit.
- [x] Rate limit: the Test button is limited to 10 a minute (each is a real, paid call). No public route was added.
- [x] Dependencies vetted, exact versions, installed with `--ignore-scripts`; `npm audit --audit-level=high` unchanged (none high).
- [ ] Not done, with reasons: no re-encryption of keys when the secret changes (a later task); the cap can be passed slightly by simultaneous calls (documented, harmless for demos).

## Decisions (owner, 13 Nov 2026)
- LangChain and LangGraph are the model layer; models are called directly (no OpenRouter).
- Built before F15, as its own feature, with permission to build the slices and test them before one hand-off.
- Two key sources per business: own keys or the platform's (demos, with a cap and an end date); any model; many keys per company.
- Small, cost-efficient models for simple jobs; the platform admin chooses models per job; the developer's preset is the default.
- Emails: business manager for own keys, platform admin for platform keys.
- Cap unit: calls per month. Platform keys named `GEMINI_API_KEYS`, `OPEN_AI_API_KEY` in `.env`.

## Differences from the plan and the requirements
- Platform routes are `/platform/businesses/{id}/ai-access` and `/platform/ai/models`, `/platform/ai/tasks/{taskId}/models` (the plan said `accounts` and `ai-models`), matching the existing `/platform/businesses/{id}/modules`.
- The per-job model order replaced the single global order (owner's decision on small models for simple jobs).
- `requirements/API.md` is not updated (owner has not asked): it needs the 17 routes above.
- The brief's plan to use `kernel/database/across-accounts.ts` for the platform reads was not needed: that file does not exist; the platform repositories use the owner connection like the existing industries and modules code.

## Slice notes

### Slice 1: the model layer and GET /ai/models (13 Nov 2026)
Built `providers/llm/` (types, error reader, key pool, fallback loop, LangChain adapters, scripted test provider), `core.ai` (task list, model-choice rules, the AI service, `GET /ai/models`), migration 023, platform keys in `.env`, and the lint rule.
**Real-model check with the owner's keys:** OpenAI `gpt-4o-mini` works (about 2 s). `gemini-2.5-flash` answers "no longer available to new users" on 3 of 6 keys. `gemini-3.5-flash-lite` and `gemini-3.5-flash` work but took 10 s and 24 s. `gemini-3.8-flash` and `gemini-flash-latest` answered 503 "high demand". `gemini-flash-lite-latest` answered in 1.3 s on every key.
**Fixes the real check found:** a 30-second limit per try; an empty answer counts as a failed try; 503 / "high demand" counts as an overload; per-model key rotation; pools named by a fingerprint of the key list.
**Migration 024 (after the owner's go):** an order per job, `kind`, `size`, `is_alias`, `retires_on`; `gemini-2.5-flash` deprecated and last in every job; four models added.

### Slice 2: own keys, save and list
`POST`, `GET /ai/keys`; `ai_keys` (025); the secret box; the 10-key limit; 409 for the same key twice; 503 without the server secret; the key never in a response, log, event or error.

### Slice 3: remove and test a key
`DELETE /ai/keys/{id}`, `POST /ai/keys/{id}/test`; migration 026 (wipe at removal, trigger); the test tries up to three of the company's models; a rejected key is *failed*, a used-up quota *limited*, a network problem leaves the status.

### Slice 4: settings
`GET`, `PUT /ai/settings`; `ai_settings` (027); the call service now reads the business's settings and uses its own keys (own first), notes a change in a key's health from real use, and `GET /ai/models` answers per business.

### Slice 5: platform control per business
`GET`, `PUT /platform/businesses/{id}/ai-access`; two log lines (the business's own, by "the platform"; the admin's, by the admin) and an event.

### Slice 6: usage, the cap and what is running
`GET /ai/usage`, `GET /ai/status`; migration 028; every call is recorded in the same transaction as the day's totals; the cap and the end date are enforced; found and fixed on the way: a constant in `GROUP BY`, and date and big-number types.

### Slice 7: call log and platform key health
`GET /ai/calls`, `GET /platform/ai/keys`; migration 029.

### Slice 8: model list and job order
`GET`, `POST /platform/ai/models`, `PATCH /platform/ai/models/{id}`, `PUT /platform/ai/tasks/{taskId}/models`. Retiring a model takes it out of every answer at once.

### Slice 9: nightly checks and warning emails
Jobs `ai.check_health`, `ai.check_business_keys`, `ai.check_fallbacks`, `ai.clean_old_calls`; migration 030; one kernel change: jobs now receive `job.services` (settings, database, mail, AI layer); the provider layer gained `listModels`; `npm run ai:check`.
