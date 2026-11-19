---
name: f19-ai-agent-text
description: F19 (the text AI agent and Test the agent) - branch, slices, owner decisions R61/R62, how to try it, what is left
metadata:
  type: project
---

F19 is built on branch `feature/F19-ai-agent` (all five slices) and was **approved by the owner on 16 Nov 2026** (committed on the branch; NOT yet merged into `dev` and not pushed: those need their own word). F20 (website chat) is next in the plan.

- Module `core.agents`; routes `POST /agent/test-chat`, `GET /agent/test-chats/{id}`, `POST /agent/test-chats/{id}/summary`; migrations 038 and 039 (already applied to the Supabase dev DB, along with F15's 036/037); job `agents.summarise_conversation` (nothing queues it yet, channels will from F20).
- Owner decisions (R61, 16 Nov 2026): test chats are saved as conversations marked `is_test` and never become contacts/leads/tickets; unanswered questions found by a test chat are logged for real; the promise is stored as a fact (F08 makes the task); the tool loop uses LangGraph's core graph API (its ready-made agent is deprecated); six tools only.
- Owner asked to (a) check the hotel agent code for how it did things and (b) keep channels plug and play: done with a per-channel prompt note and `agentTools` in the module manifest (`kernel/module-system/agent-tools.ts`).
- `npm run eval:agent` runs 14 English scenarios against a real model with the platform's .env keys (no DB); `-- --show` prints the conversations. 14/14 twice on 16 Nov 2026. It found two real faults the scripted tests missed, so run it after any prompt or tool change.
- Postman collection: *Toobler One - F19 AI agent and Test the agent (run in order)* in My Workspace.
- Known limits are listed in the brief (callback minutes fixed at 15; no running summary for long chats until F20; the Test the agent screen waits for the designer).

**Why:** the owner approves one feature at a time and tests each slice. **How to apply:** on "approved", set `approved` with the date in STATUS.md and commit only when they say commit; see [[feature-gate-workflow]], [[small-api-slices]] and [[ask-before-committing]].
