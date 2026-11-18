---
name: dont-overengineer-means-no-extra-complexity
description: "Don't over-engineer" = no unnecessary complexity; it never means skipping proper error handling, validation, security, tests or optimisation
metadata:
  type: feedback
---

When the owner says "don't over-engineer the APIs" (13 Nov 2026, F18), it means: do not add unnecessary complexity (extra layers, tables, packages, abstractions the feature does not need). It does **not** mean "keep everything minimal": proper error management, validation, security checks, locking, tests and sensible optimisation stay in full.

**Why:** the owner clarified after I over-read the instruction and described my code as "kept simple"; they want correct, well-built APIs without needless extras.
**How to apply:** build the full proper behaviour for each route (clear errors, 400/401/403/404/409 paths, isolation, logging without personal data, tests), reuse existing patterns, and only skip things the current slice does not need. Do not trade correctness or performance for brevity. See [[small-api-slices]] and [[readable-code-naming]].
