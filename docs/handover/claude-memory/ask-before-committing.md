---
name: ask-before-committing
description: Owner wants to review changed files uncommitted; never commit without asking first, every time
metadata:
  type: feedback
---

Do not commit until the owner says so. After finishing a slice, leave the changes uncommitted so the owner can see the changed files (git status/diff) and understand them, then ask "may I commit?" before every commit. Once they approve, commit then.

**Why:** the owner is learning and verifies each change by looking at the changed files; commits hide that. Stated 2026-11-11, after I committed F03 slice 1 unasked.

**How to apply:** applies to every commit, including brief/doc commits. Push rules are unchanged (only when the owner says). Refines [[feature-gate-workflow]].

13 Nov 2026 (UI rebuild): in practice the owner answers each hand-off with "commit" (or "ok commit and continue"); I never commit
before that, one commit per slice (backend changes as their own commit), then continue with the next slice. A bare "continue" does
NOT mean commit. Pushing and merging still need their own explicit word.
