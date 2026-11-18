---
name: autonomous-slices-phase-one
description: From 17 Nov 2026 the owner lets me finish Phase 1 without waiting for approval, slice by slice (max 2 APIs), test + verify each, then next
metadata:
  type: feedback
---

Owner said (17 Nov 2026): "you don't have to wait for my approval, complete phase one ... go with the flow like 2 APIs at a time, test, verify, then next, then the tests." Overrides the "stop and wait after each slice" gate for now.

**Why:** the owner wants Phase 1 finished; waiting after every slice was slowing it down.

**How to apply:** keep slices at 2 routes max, build backend + screen together, run relevant tests + tsc + lint, check the screen in the headless browser, write the docs/feature notes, commit locally per slice (never push or merge, never touch the owner's other processes), then start the next slice. Still ask before real design/product decisions that change requirements (record them in REQUIREMENTS-REVIEW.md). Full `npm run verify` at feature hand-offs. See [[feature-gate-workflow]] and [[small-api-slices]].
