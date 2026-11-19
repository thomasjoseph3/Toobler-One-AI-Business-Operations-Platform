---
name: feature-as-one-unit
description: From 18 Nov 2026 a feature is built as one unit (no 2-routes-per-slice limit), with all tests; recorded in CLAUDE.md
metadata:
  type: feedback
---

On 18 Nov 2026 the owner lifted the "max 2 API routes per slice" rule: build one feature as one unit with all its tests, one hand-off per feature (commit in logical pieces inside it).

**Why:** the owner wants the remaining Phase 1 features (F12, F13, F21-F30, F32-F36) built faster; the slice routine was mostly overhead since the standing instruction already removed the waiting.

**How to apply:** brief, migration, backend, front end, ALL tests (unit, API, isolation, journey, browser), `npm run verify`, feature guide, then mark approved under the standing instruction. Never loosen tests, role checks, RLS, "Are you sure?" or the feature guide. Replaces [[small-api-slices]] for new features. See [[autonomous-slices-phase-one]].

**Also (18 Nov 2026, owner):** when `npm run verify` is green, approve the feature myself (STATUS.md, date) and go straight to the next one. The owner will review everything only after all of Phase 1 is built. Never run tests while `npm run verify` is running (they share the test database and make each other fail).
