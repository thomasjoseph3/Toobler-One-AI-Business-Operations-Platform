---
name: never-kill-unknown-processes-or-take-fixed-ports
description: Never kill a process I did not start, and do not assume a busy port is mine; the owner runs other apps (another Claude session, other folders) on this machine, including on port 3100
metadata:
  type: feedback
---

On 16 Nov 2026 I killed two processes holding port 3100 (twice) because the Playwright run said "already used" and I assumed they were leftovers of my own aborted run. The owner runs another application, in another folder and another Claude session, on port 3100.

**Why:** I never checked what the process was, and I may have stopped the owner's other app.

**How to apply:** A busy port is not mine until I have checked (`ss -ltnp`, the process's command line and working folder) that I started it in this session. Never `kill` or `pkill` anything I did not start myself, and never `pkill -f` broad patterns. Ask the owner first. Prefer unusual ports for test servers and let them be set by an environment variable; tell the owner which ports a test run needs before running it. The e2e ports in this repo are 3100 (web copy, `E2E_WEB_PORT`) and 3200-3202 (website chat fixtures): both may clash with the owner's other apps.
