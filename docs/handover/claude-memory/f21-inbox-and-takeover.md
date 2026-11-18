---
name: f21-inbox-and-takeover
description: F21 inbox, staff takeover and live updates approved 18 Nov 2026 (dev at d15e186+); decisions R80, what is deferred, next is F22
metadata:
  type: project
---

F21 approved by the owner 18 Nov 2026. Merged into `dev`, pushed to the `personal` remote (the office `origin` push fails with "Repository not found": token has no access). Next: F22 Today.

- Routes: GET /conversations (inbox), POST /conversations/{id}/takeover|handback|reply|done, GET /events (module `core.live`). Migrations 069, 070 (applied to the test DB only; Supabase needs `npm run db:migrate`).
- Decisions R80. Deferred: "Answered from" links; replies only on web chat until F25/F26/F29.
- Full handover notes: `docs/HANDOVER.md`.

**Why:** owner works from another (Windows) machine next.
**How to apply:** start F22 with the `feature` skill; F22 needs lead and task event names added to `live-updates/helpers/live-events.ts`.
