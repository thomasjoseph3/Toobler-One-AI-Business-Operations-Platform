---
name: feature-gate-workflow
description: Owner requires strict one-feature-at-a-time builds with manual testing and explicit approval before the next feature
metadata:
  node_type: memory
  type: feedback
  originSessionId: e891b4fa-b58b-424f-9e49-1b74e507f20b
  modified: 2026-11-09T09:33:21.840Z
---

Build exactly one feature at a time (backend + its front end + tests), verify it, hand it over with a manual test
script, then STOP until the owner says it's approved. Never prep or scaffold the next feature early.

**Why:** the owner wants to understand each feature and how the product is built as it grows; they test every
feature by hand before moving on.

**How to apply:** follow docs/DEVELOPMENT.md and the `feature` skill; status in docs/plan/STATUS.md; commit only after
approval. See [[lead-engine-rebuild]].
