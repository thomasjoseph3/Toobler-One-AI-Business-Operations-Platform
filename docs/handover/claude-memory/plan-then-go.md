---
name: plan-then-go
description: Owner rule - before changing any files, show the plan for the slice and wait for the owner's "go"
metadata:
  type: feedback
---

Pattern every slice: owner says "continue" -> I present the plan (files, routes, tests, checks) without touching files ->
owner says "go" -> I build -> I explain file by file, give Postman/browser steps, leave changes uncommitted, ask
"may I commit?" -> owner tests and says continue.

**Why:** the owner wants control and understanding of the code base (see [[small-api-slices]], [[ask-before-committing]]).

**How to apply:** a bare "ok"/"continue" after a hand-off means present the plan, not build. Docs edits for hand-off
and approval follow the same rule of asking before commit and before push or merge to `dev`.

13 Nov 2026 (UI rebuild): the owner now says "continue", "ok" or "go" after a hand-off and expects me to move on to the next
slice. Do that: give a short plan, ask ONLY the decisions that are really unclear (use AskUserQuestion with a recommended first
option and plain words), then build. The owner also said "if you have any confusions to ask just ask me": never guess product
behaviour (for example what "Next activity" means). See [[ask-when-unclear]].
