---
name: voice-uses-business-own-keys
description: Platform AI tokens may run agents (chat, voice, assistant) within a token cap; connectors (WhatsApp, email, phone provider accounts) are always the business's own. Updated 2026-11-17 (R65, R66)
metadata:
  type: project
---

Updated 2026-11-17 (replaces the 11 Nov "voice uses own keys" decision). **Agents** (website chat, voice calls, staff assistant, setup help) may use the platform's AI keys when the platform admin allows it for a business (demo, or commercial charged by tokens), counted and capped per month by **tokens** (and calls) and an end date. **Connectors** (WhatsApp, email, phone numbers and their provider accounts) are never ours: the business brings its own, stored encrypted in `connections` (F25/F29).

**Why:** the owner wants control and a way to charge by token use; a business is never asked which keys to use (own first, then platform if admin allowed it; migration 046).

**How to apply:** token cap is built (migration 047). Still queued (R66): admin cannot allow an agent use whose connector is not set up; per-use tick with own cap; platform-admin screen. See [[feature-gate-workflow]].
