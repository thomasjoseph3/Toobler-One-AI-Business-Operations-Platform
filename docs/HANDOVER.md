# Handover: how to carry on from another machine

Written 18 Nov 2026 so work can continue from a fresh clone (for example a Windows machine) with a new Claude Code session.
The rules are in `CLAUDE.md`; the plan and status are in `docs/plan/STATUS.md`. This file holds what is **not** written anywhere else.
A copy of Claude's own memory notes is in `docs/handover/claude-memory/` (how to restore it: `docs/handover/README.md`).

## 1. Where things stand

- **Approved and committed:** everything up to and including **F13 Duplicates and merging** (and the UI rebuild, tasks, teams, companies, custom fields, scoring, views, import and export). The last full green verify for F13: 2,948 unit/API tests and 766 browser tests.
- **F21 Inbox, staff takeover and live updates:** built and committed (commit `a7127cb`, branch `feature/F21-inbox-and-takeover`, merged into `dev`). **Approved by the owner on 18 Nov 2026.** Its brief and manual test script are in `docs/features/F21-inbox-and-takeover.md`.
- **Left (the order proposed to the owner):** F22 Today, F23 Staff alerts and morning summary, F25 WhatsApp, F26 Email, F24 Privacy and support access, F27 Follow-ups, F28 Reports, F29 Phone calls, F30 Staff assistant and MCP, then F32 free check, F33 competitor report, F34 billing, F35 platform console, F36 go live. That is 14 features. Rough size: smaller ones 1 to 3 hours of work each, WhatsApp, email, phone and the assistant 3 to 6 hours each.
- **To resume:** open Claude Code in the project and say "continue". It reads `docs/plan/STATUS.md`, starts the next planned feature with the `feature` skill (`npm run gate` must say no feature is in progress; it does now, F21 is approved), and works through brief, migration, backend, front end, all tests, `npm run verify`, hand-off.

**Verify state when this was pushed:** the last full `npm run verify` had all unit/API tests green (2,978 of 2,978) and 781 of 782 browser tests. The one red test was a flaky test of mine in `e2e/inbox.spec.ts` (two filter clicks within milliseconds); it was fixed (the Inbox now reads the address at click time) and the repeat run of that file passed **192 of 192** (12 repeats on phone and desktop). The final full verify was **not** re-run after that fix. **First thing to do on the new machine: run `npm run verify` and fix anything red** before starting F22.

## 2. Set-up on a new machine (Windows notes)

1. Clone the repo and check out `dev`: `https://github.com/thomasjoseph3/Toobler-One-AI-Business-Operations-Platform.git` (this is the remote called `personal`; the office remote `origin` = `toobler/toobler-tone` was answering "Repository not found" with the saved token, so it was not pushed to).
2. Clone the old project **next to it** (folder named `hotel agent` beside `lead-engine-good`): `https://github.com/thomasjoseph3/booker.git`. F25 (WhatsApp) and F26 (email) are ported from it, and CLAUDE.md's "reuse check" reads it. Read the old code for an area at the start of that feature.
3. Node: the version in `.nvmrc` (use nvm-windows). `npm install`, then `npx playwright install` once.
4. Docker Desktop for the local **test** database: `npm run db:up`, then `npm run db:migrate:test`. `TEST_DATABASE_URL` must be set in `.env` (it is commented out in `.env.example`); it points at the local Docker database (port 54329), each machine has its own copy.
5. `.env`: the owner uses the **same `.env`** on both machines (never committed). `npm run setup` makes a fresh one. Check no value in it is a Linux-only file path.
6. **Migrate the real (Supabase) development database once:** `npm run db:migrate`. Migrations **068** (duplicates), **069** (conversation takeover) and **070** (who wrote a staff message) were applied only to the local test database, **not** to Supabase. Until they are, the Possible duplicates, Inbox and takeover screens fail against the real database. Both machines share that one Supabase database, so run it only once.
7. **Never run tests against `DATABASE_URL`** (Supabase); tests use `TEST_DATABASE_URL`. Never run two test runs at once against the test database (it makes hundreds of tests fail).
8. Use Git Bash or WSL if a script assumes a Unix shell. Claude Code's permission settings (`.claude/settings.local.json`) are not in git: expect more permission questions, or run `/fewer-permission-prompts`.
9. Pushing from Claude Code may be blocked by its permission check ("Unsanctioned Communication"). Then the owner runs the push themselves in the prompt: `! git push personal dev`.
10. Run `npm run verify` once to prove the machine is set up: it must be green before any hand-off.

## 3. How the owner likes to work (not all of this is in CLAUDE.md)

- One feature at a time. Since 18 Nov 2026 a feature is **one unit** (brief, migration, backend, front end, all tests, verify, hand-off); the old two-routes-at-a-time rule is gone.
- **Standing instruction:** carry on to the next feature without waiting for approval, unless a real product decision is needed (then ask, with a recommendation, in plain words, using the question tool).
- Commit locally as logical commits (message ends with the Co-Authored-By line). Pushing and merging need the owner's word; on 18 Nov 2026 they asked for everything to be pushed to `dev`.
- The owner is learning TypeScript: full descriptive names, a comment on every function, simple explicit code (rules in `CLAUDE.md`).
- Plain English in explanations; give the owner exact steps to test (browser and Postman). Be honest about time and what was not verified.
- Never kill processes you don't know (the owner runs other apps, for example on port 3100); use unusual ports for tests.
- Every feature file in `docs/features/` starts with a plain-English **Feature guide** (F18's is the model; F13's and F21's are recent examples).
- Before building a feature, read the old project's code for that area (`../hotel agent`) and write what is reused in the brief.

## 4. Owner decisions that are only recorded here or in `docs/REQUIREMENTS-REVIEW.md`

- **F13:** a merge is refused when both contacts have an open lead (R79).
- **F21:** "Answered from" links are deferred (the agent does not save its sources yet; a small follow-up in the agent's saved turn); replies work on web chat only; the live stream reads the event outbox every 2 seconds, so it works with several API processes (R80).
- **F29 Phone calls:** build the **web call** (browser voice) first. Write the **phone** code with **Twilio** in mind (adapter, webhooks, number set-up, each business's own encrypted keys) behind the same channel interface, but leave it unconnected until the owner sets up a Twilio account.
- **F25 WhatsApp and F26 Email** already work in the old project: port them to TypeScript and to our `ChannelAdapter` / conversation-engine design (don't copy industry-specific code paths). Real provider connections need accounts and keys from the owner. F21's reply route returns 409 `CHANNEL_CANNOT_REPLY_YET` for these channels: each adds its sender when built.
- Web call, WhatsApp and phone run on **each business's own encrypted keys** (decided 11 Nov 2026).
- The dev database (Supabase) may be used for ordinary reads and writes through the repo's own commands; demo data was allowed on 13 Nov 2026.

## 5. Things a new session should know about the code (recent work)

- **Merging records (F13):** a merged-away contact or company stays as a deleted row with `merged_into_id`. Each module that owns rows pointing at a contact has its own `move...ToContact` function (leads, tasks, tickets, activities, conversations, lists); `core.duplicates` calls them through each module's `index.ts`. Migration 068 grants `UPDATE (contact_id)` on those tables for this.
- **Takeover (F21):** a hold is `conversations.held_by_user_id` + `held_until` (two hours, extended by each reply); an expired hold counts as released at once. The AI's reply is saved under the conversation's row lock (`saveCustomerMessageAndAgentReply`), so a takeover during the AI's thinking wins. Staff messages are shown to the agent as "[A team member of the business replied]".
- **Messages saved together** (customer message and the AI's reply, one transaction) get explicit times one millisecond apart so they cannot sort the wrong way round.
- **Live updates:** `GET /events` (module `core.live`, folder `live-updates`) reads each business's own new rows of `domain_events` every 2 seconds. Add new event names to `helpers/live-events.ts` (F22 Today will need lead and task events).
- **Web chat widget** (`apps/site/src/chat`) now shows staff replies and asks for new messages every 4 seconds (its own rate limit, `widgetPoll`). The built widget files are in `apps/site/dist` (ignored by git; `npm run build:widget` makes them).
- **Test helpers:** `apps/api/test/support/` (`signUpOwner`, `addTeamMember`, `buildTestApp`), browser tests use a pretend API in `e2e/pretend-*.ts` wired in `e2e/support.ts`.
- **Isolation register:** every new route needs an entry in `apps/api/test/isolation.test.ts` (an attempt by the other business, or an exemption with a reason).
- **Activity-log words:** every new log `kind` needs an `activity.kind.*` line in `apps/web/src/app/i18n.ts`.

## 6. Useful commands

`npm run dev` (API on 4000, web on 3000) · `npm test` · `npm run e2e` · `npm run verify` · `npm run gate` ·
`npm run db:up` · `npm run db:migrate` (Supabase) · `npm run db:migrate:test` (local test database) ·
`npm run conversation:simulate` · `npm run duplicates:detect -- --email <manager email>`.
The full list is in `COMMANDS.md`.
