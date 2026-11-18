---
name: test-scope-per-slice
description: Owner wants only the relevant tests run per slice; the full test suite only at the end of a feature
metadata:
  type: feedback
---

On 12 Nov 2026 the owner said: "dont run entire test on every slice, just run the necessary ones and after one feature do the entire testing, that is why it is taking so much time."

**Why:** the full suite (about 900 tests, ~80 s, plus `npm run e2e`) on every slice made each slice slow.
**How to apply:** per slice run `npm run typecheck`, `npx eslint <changed folders>`, `npx prettier --check` on changed files, and `npx vitest run <the test files the slice touches>` (plus any earlier feature's tests it changes, and `isolation`/`team-journey` only when routes or cross-module behaviour change). Run the full gate / format / lint / typecheck / `npm test` / `npm run e2e` once, at the feature hand-off. See [[small-api-slices]] and [[feature-gate-workflow]].
