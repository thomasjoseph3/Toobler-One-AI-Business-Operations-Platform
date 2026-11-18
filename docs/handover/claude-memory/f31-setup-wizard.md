---
name: f31-setup-wizard
description: F31 setup wizard status: slices 1-4 built and committed, slice 5 (setup chat) paused for the UI catch-up; routes, decisions, how to try it
metadata:
  type: project
---

F31 is `in_progress` in `docs/plan/STATUS.md`, brief `docs/features/F31-setup-wizard.md` (build log per slice). Branch `feature/F31-setup-wizard` (cut from `fix/scheduled-job-null-data`, which holds the job-runner fix for cron jobs getting null data). Not merged, not pushed.

**Built (backend, tested, committed):** slice 1 `GET/PATCH /setup`; slice 2 safe website reader (no route); slice 3 `POST /knowledge/prefill`, `GET /knowledge/prefill/{id}` (reads website and, behind `GOOGLE_PLACES_API_KEY`, a Google listing; answers wait as "Please check"); slice 4 `POST /setup/apply-preset` (industry stage words, table in `modules/core/setup/helpers/industry-pipeline-presets.ts`), `POST /setup/go-live`, callback promise minutes (`accounts.callback_promise_minutes`, in `/knowledge/settings`), `accounts.live_at` (existing businesses were marked live; new ones are not, the website chat answers 503 NOT_OPEN_YET until go-live). Migrations 042-045.
**Left:** slice 5 setup chat (`POST /setup/chat`, code picks the question, AI only phrases/parses, English only), then slices 6-8 are largely covered by C1-C3 screens plus journey tests, Feature guide, verify. Differences to record as R65 in REQUIREMENTS-REVIEW.md at hand-off.
**Owner decisions:** test chat instead of test call until F29; Google behind a key (untested against real Google); go-live is a real switch; suggestions from the website are shown for the owner to accept.
**Not yet tried against real services:** the AI reading a real website and the Google client use pretend AI/Google in tests.
See [[ui-catchup-before-backend]], [[f20-website-chat]].

**Update 17 Nov 2026:** slice 5 (POST /setup/chat, R68) and slice 7 (chat screen /setup/chat) built and committed; F31 marked approved under the owner's standing instruction [[autonomous-slices-phase-one]] (owner has not reviewed by hand). Full verify run: format, lint, typecheck, 2355 unit/API tests, e2e all green (e2e must run with E2E_WEB_PORT=3917 because the owner's app uses 3100). Next feature in the table: F02 Team, roles and the activity log.
