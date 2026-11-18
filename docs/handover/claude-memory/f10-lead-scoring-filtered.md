---
name: f10-lead-scoring-filtered
description: F10 lead scoring + Filtered tab approved 18 Nov 2026 (4078470); remotes switched to the office repo; F11 next
metadata:
  type: project
---

F10 approved 18 Nov 2026 (verify green: 2748 unit/API, 669 e2e). Scoring in `leads/helpers/score.ts`, applied after a conversation via `conversation.outcomes_applied` (agents module); `PATCH /leads/{id}/temperature`; Filtered tab = conversations (`GET /conversations?filtered=true`, `POST /conversations/{id}/unfilter`, owner chose this, R76). Prompt version `agent-2`. Migrations through 062 applied to dev DB.

**Git (18 Nov 2026):** `origin` is now the OFFICE repo https://github.com/toobler/toobler-tone.git (owner signs in as thomasjoseph4); the old personal repo is remote `personal` and is no longer pushed to. main, dev and feature/F31 were fast-forwarded to 934ec89 and pushed at the owner's request. Push needs a token the owner provides (never stored; use `-c credential.helper= -c http.extraheader=Authorization: Basic ...` one-off; token needs `repo` + `workflow`). Remind owner to revoke tokens pasted in chat.

**How to apply:** F11 is built on `feature/F11-views-filters-search` cut from dev. Same slice routine. See [[f09-custom-fields]].
