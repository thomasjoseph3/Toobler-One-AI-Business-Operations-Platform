---
name: feature-guides-in-feature-files
description: "Every feature file in docs/features/ gets a plain-English \"Feature guide\" section at the top; write F18's with slice 6, then backfill F00-F17, then make it a rule"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2289cb64-d2c2-4a74-8153-5182a5a0bf7a
  modified: 2026-11-13T05:03:34.666Z
---

The owner wants proper documentation per feature (decided 13 Nov 2026, during F18): what it does, why it is useful, how it works (an example journey), how it was implemented, how it is configured (settings, schedules, limits, roles), what it expects (inputs, outputs, errors, rules), how to test it, known limits. It goes in the **existing feature file** (`docs/features/Fxx-*.md`) as a "Feature guide" section at the top, above the build log.

**Audience:** written so a non-technical person (the application's user) can understand it, but the tech team reads it too. So: plain-English first (what, why, journey, settings), then a clearly marked "For the tech team" part (modules, tables, routes, jobs, events).

**Status (13 Nov 2026): all done.** F18's guide was written with slice 6, F00-F17 and the API docs page were backfilled, and the rule is now in CLAUDE.md (gate item 6) and the `feature` skill's handoff step. **Order the owner asked for (done):** (1) write F18's guide as part of slice 6 (including how the nightly merge job works, how it is configured and what it benefits), showing the outline first; (2) after F18 is complete, write the guides for F00-F17 (from the briefs and code, no feature code changes); (3) then make "write the Feature guide at hand-off" a rule (add to the `feature` skill's handoff step and CLAUDE.md).

**Why:** the briefs were mostly a build log; the owner needs documentation that explains the features to users and to the team.
**How to apply:** write the guide in every feature before hand-off, keep the top part free of jargon, and update older guides when a later feature changes their behaviour. See [[feature-gate-workflow]] and [[readable-code-naming]].
