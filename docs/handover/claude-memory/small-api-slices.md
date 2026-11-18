---
name: small-api-slices
description: Owner rule - build at most 2 API routes at a time, explain every folder/file changed, owner verifies before the next slice
metadata:
  type: feedback
---

Never build more than 2 API routes at once. After each slice, explain folder by folder and file by file what was added or
changed and why, give Postman and browser test steps, then stop until the owner verifies and says continue.

**Why:** on 10 Nov 2026 I built 12 auth routes and 49 files in one go (F01 stage A); the owner could not follow it and said
they want control and understanding of the code base. Related: [[feature-gate-workflow]], [[readable-code-naming]].

**How to apply:** plan each feature as slices of at most 2 routes (with the screen that uses them), put them in the brief,
commit per slice, explain per file, wait for approval. Never batch or pre-build the next slice.
