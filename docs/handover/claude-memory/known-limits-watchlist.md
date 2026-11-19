---
name: known-limits-watchlist
description: The owner wants the recorded "known limits" tracked until each has a solution; where they live and when to re-check them
metadata:
  type: feedback
---

The owner said (12 Nov 2026, after F14 hand-off): "keep an eye on this known limits, we need to find solutions for them." They are
recorded as rows R39 to R45 in `docs/REQUIREMENTS-REVIEW.md` (disabled owners, 400-before-401, isolation suite (done, R41),
contacts `staff_own`, LEAD_OPEN naming ids, npm audit, alerts), and in each feature brief's "Known limits".

**Why:** the owner does not want limits to be quietly forgotten; each needs an owner-approved solution and a feature or date.
**How to apply:** at the start of every feature (`feature start`) and at every hand-off, re-read R39 to R45, say which ones this
feature can now fix or must not make worse, and propose the fix as a decision (never silently). New limits found in a review get a new
R-row with a proposed solution. When a limit is fixed, mark the row Done with the date. See [[feature-gate-workflow]] and [[small-api-slices]].

13 Nov 2026: the owner also keeps "note for later" rows in `docs/REQUIREMENTS-REVIEW.md`: R51 (Leads list gaps: lead source values,
owner names with F02, sort by name, designer's next-activity screen), R52 (working hours, Available / Away and an open-lead cap for
the lead sharing-out, after F02), R53 (industry-specific labels for a lead's dates), R54 (show each lead's progress on the Pipeline
board, after the full design). When the owner says "add it in the note so we do it later", add an R-row there (and a line in the feature
brief's known limits) and mention it in the hand-off. Re-read them at every feature start with R39 to R45.
