---
name: backend-names-stay-exact
description: Front end must use backend/API names exactly as delivered; tell the owner BEFORE converting or mapping any name to match the UI or Figma
metadata:
  node_type: memory
  type: feedback
  originSessionId: 1383a7d3-60d7-4ad3-93e3-6265c0c95e2b
  modified: 2026-11-13T08:51:00.350Z
---

Keep names exactly as they come from the backend (API field names, enum values, stage names, labels). If any name must be converted or mapped to match the front end or the Figma design, tell the owner first and wait for their answer before doing it.

**Why:** Owner said so on 2026-11-13 while starting the v1.3 design rebuild; the Figma uses its own words (e.g. "Lead Owner", "Rate sent") that may differ from backend names.

**How to apply:** When building a screen from Figma, compare each Figma label/status with the API's names and list every mismatch for the owner to decide. Renames of purely front-end things (components, CSS tokens) are separate, but still mention them in the plan. See [[plan-then-go]] and [[readable-code-naming]].
