---
name: f15-conversation-types
description: "State and decisions of F15 (conversation types, router, sorting, outcomes, staff correction): branch, what is built, decisions R56-R60, how to try it"
metadata:
  node_type: memory
  type: project
  originSessionId: 0dbe8d3f-d357-4660-b81d-1740e4e6ca95
  modified: 2026-11-16T08:03:31.963Z
---

F15 is built on branch `feature/F15-conversation-types` (cut from `dev` on 16 Nov 2026, not pushed or merged), module `core.conversations`.
All slices are committed (1 to 4, 5, 6 plus a tidy-up, 7a, 7b, 7c). Status in STATUS.md: **approved on 16 Nov 2026** (the owner accepted R59 and R60 as built). The branch is not yet merged into `dev` or pushed: ask before merging or pushing. Next feature in order: F19 (the AI agent, text), then F20 (website chat).
The owner tested slices 1 to 4 in Postman. Brief: docs/features/F15-conversation-types-and-router.md (Feature guide, manual test script, security checklist).

**Decisions (owner, 16 Nov 2026):** R56 messages stored now, models by the F37 order (Gemini Flash-Lite, then GPT-4o mini), no separate test feed. R58 the first release sorts only AFTER a conversation ends; the live type during a call comes after Phase 1. The classifier lives in `core.conversations`, not in an agents folder (ARCHITECTURE.md section 3 updated). Slice 7 was split into 7a, 7b, 7c with a simulate script (owner chose it). Limit of 25 active types kept, enforced in the database.
**Mine, owner to confirm:** R57 (database review), R59 (contact, lead and ticket rules; an anonymous visitor waits for a person), R60 (the own-leads-only role cannot read conversations; a correction keeps the lead as "Reclassified" and closes the ticket with a note).

**Why:** the owner wants the leads to come in from channels later (website chat F20 first, then WhatsApp, email, calls); F19 (the AI agent) comes before F20. The web chat widget is to be plain HTML/CSS/JS as a custom element (works in React, Angular, WordPress), decided in conversation, to be written into the F20 brief.
**How to apply:** try it with `npm run conversation:simulate` (writes to the dev DB, real AI call) and the Postman folders 9 and 10 in "Toobler One - F15 conversation types (run in order)"; measure with `npm run eval:types`. See [[feature-gate-workflow]], [[small-api-slices]], [[postman-mcp-and-collections]] and [[ask-before-committing]] (commit only when the owner says commit; I grouped slices 5, 6+tidy, 7a in separate commits).
