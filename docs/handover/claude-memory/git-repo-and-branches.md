---
name: git-repo-and-branches
description: "GitHub repo for Toobler One and the branch model (main = production, dev = development)"
metadata:
  node_type: memory
  type: reference
  originSessionId: e891b4fa-b58b-424f-9e49-1b74e507f20b
  modified: 2026-11-09T10:17:41.311Z
---

Repo: https://github.com/thomasjoseph3/Toobler-One-AI-Business-Operations-Platform.git (owner's account thomasjoseph3).
`main` = production, `dev` = development; both pushed 9 Nov 2026 at the initial commit. Day-to-day work happens on
`dev` (feature branches `feature/Fxx-name` merge into `dev`); `main` only receives checked merges from `dev`.
Owner asked explicitly for the first push; otherwise commit/push only on request or after a feature is approved
(see [[feature-gate-workflow]]). `.env` is git-ignored; never commit it.

10 Nov 2026: owner asked me to "manage the branches and add proper commits". So: work on `feature/Fxx-name` branches cut
from `dev`, make small logical commits with a descriptive body and the Co-Authored-By line, keep the working tree clean
between steps. Committing is now expected; pushing and merging into `dev`/`main` still need the owner's word.

13 Nov 2026: the owner asked me to "merge to dev and make sure github is updated" for the UI rebuild: `feature/ui-design-v1.3`
(slices 1 to 9, built on top of `dev` at 6cf4839 plus the merged `feature/F01-ui-sign-in`) was merged into `dev` and pushed to
origin (together with the feature branch itself). `main` was left alone. The owner's own words authorise each push or merge:
ask again next time rather than assuming a standing permission.
