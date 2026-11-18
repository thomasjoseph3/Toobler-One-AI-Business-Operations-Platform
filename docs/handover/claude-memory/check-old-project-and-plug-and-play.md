---
name: check-old-project-and-plug-and-play
description: Owner expects me to actually read the hotel agent's code for each area, and every channel/engine must stay plug and play
metadata:
  type: feedback
---

On 16 Nov 2026, mid-way through F19, the owner asked "did you check the other project for it, how we coded and all there, and it should also follow each channel must be like plug and play". I had read only part of the hotel agent's agent code; reading the rest (chat.js, tools.js) turned up four worthwhile ideas (per-channel prompt note, earlier tool results as amount sources, a safe reply if the model fails after a tool acted, tools declaring their effect).

**Why:** the owner wants the old project's working tech reused, and Toobler One's architecture is core plus plug-in modules.
**How to apply:** at the start of each feature read ALL the old code for that area (not a sample) and say in the brief what was reused and what was left; when something new touches channels or engines, add a manifest hook (like `agentTools`) so a module plugs in without changing the core, and test that an inactive module adds nothing. See [[feature-gate-workflow]].
