---
name: f11-f12-views-lists-import-export
description: F11 approved (18 Nov 2026) and F12 built (approve when verify is green); what exists, packages, the branch, what is next (F13)
metadata:
  type: project
---

**F11 (approved 18 Nov 2026):** search (`GET /search`, top bar box), saved views of Leads (`/views`, tabs, share = managers), the filter engine (`packages/shared/src/filter-conditions.ts`, `apps/api/src/kernel/filters/`; on Leads, Contacts, Companies via `filters` query; Tasks keep their own), static contact lists (`/lists`, `/contacts/lists`), Next-activity chip + notes icon fixed to the Figma (date = earlier of callback and next open task via `GET /tasks/next-due`). Column chooser NOT built (known gap, in the F11 guide). Decisions R75-R77.

**F12 (APPROVED 18 Nov 2026, verify green: 2912 unit/API, 752 e2e):** modules `core.imports` and `core.exports`; import wizard `/contacts/import`; Export buttons (managers) on Contacts, Companies, Leads; download page `/exports/:id`; migrations 065-067; packages @fastify/multipart, csv-parse, read-excel-file (owner approved, in docs/DEPENDENCIES.md); export is CSV; decisions R78; 10,000-row import measured ~30 s.

**Branch:** `feature/F12-import-and-export` (cut from `feature/F11-views-filters-search`, which was cut from `dev`). NOT pushed to the office repo; `origin` = office repo toobler-tone (needs a token from the owner to push; see [[f10-lead-scoring-filtered]]). Merge into dev/main only when the owner says.

**Next:** F13 duplicates and merging, then F21, F22, F23, F24, F25, F26, F27, F28, F29, F30, F32, F33, F34, F35 (platform console: owner wants an admin UI, today platform admin = API only), F36. 16 features left after F12 approval.

**How to apply:** [[feature-as-one-unit]] (one feature = one unit, all tests, auto-approve on green verify, owner reviews after Phase 1). Never run tests while `npm run verify` runs. Run e2e with `E2E_WEB_PORT=3917`. A new feature: read its requirements file, PHASE-1.md row, write the brief in docs/features/Fxx-*.md, migrations, backend, front end, tests, guide, verify. The 4 owner-approved cautions: dependencies must be vetted and shown first (`npm run vet -- name`), ask before diverging from requirements, names in full words, every route has works/401/403/404/400 tests plus an isolation entry.
