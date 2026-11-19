---
name: readable-code-naming
description: "Owner is learning TypeScript; wants full descriptive names and comments, never shortened"
metadata:
  node_type: memory
  type: feedback
  originSessionId: b4a70e5c-218e-4b97-ba5f-aac7e041157a
  modified: 2026-11-09T11:59:49.163Z
---

Every function and variable must be named for its true purpose in full words; never shorten (no `tx`, `trx`, `e`, `m`).

**Why:** The owner is new to TypeScript and wants to learn the codebase line by line; compact names made code like `kernel/db/index.ts` hard to follow.

**How to apply:** Use full names and plain-English comments in all new code; rename unclear names in lines you touch; don't rewrite untouched files unless asked. Rule is also in CLAUDE.md "Readability rules". See [[feature-gate-workflow]].

Also applies to docs, skills and my chat explanations, not only code: no `ctx`, `req`, `db` as variable names in examples
(use `accountContext`, `request`, `transaction`). Owner called out `ctx` on 10 Nov 2026 even though it is a common convention.
Exceptions are names a library forces (pino log keys `err`/`req`/`res`).
