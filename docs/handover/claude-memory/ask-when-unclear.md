---
name: ask-when-unclear
description: Owner wants questions asked, with a recommendation, whenever something is missing or unclear; explain in plain words
metadata:
  type: feedback
---

On 13 Nov 2026 the owner said "if you have any confusions to ask just ask me right, what we don't have like the next activity one".
When a screen needs something the API, the Figma or the requirements do not give (a missing field, an unknown meaning, a design
that does not exist), ask before building it: one or two clear questions with a recommended first option (AskUserQuestion), then
build. If they ask "what does X mean", explain in plain words with an example. Questions that read as jargon get rejected: say what each
option means for the person using the app.

**Why:** the owner is learning and wants control; guessing produced wrong turns (for example the Next activity column).
**How to apply:** before a slice, list gaps between design and data ("have / partly / missing"), put them in the brief and
`docs/REQUIREMENTS-REVIEW.md` (an R-row), and ask only what changes what I build. See [[plan-then-go]] and [[known-limits-watchlist]].
