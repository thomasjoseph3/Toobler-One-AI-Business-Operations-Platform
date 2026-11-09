# Agent builder

**Phase 7 · AI · HubSpot equivalent: Agent Hub, Agent Builder, AI Studio**

## What it is

Businesses create their own AI agents for their own jobs ("a receptionist for our second branch", "an agent that
qualifies franchise enquiries", "an agent that chases unpaid invoices"), picking the instructions, the knowledge, the
tools it may use, the channels and the hours, then testing before going live.

## How it works

1. Manager clicks **New agent**, describes the job.
2. Picks what it may do (only from tools the business's engines allow), and where it works.
3. Tests it in a chat, reviews the test log, switches it on.

## Rules

- A custom agent can never do more than the business's own permissions allow.
- The never-do-maths and never-invent rules can't be switched off.

## Done when

- [ ] A business builds, tests and runs an agent with no code; every action it takes is logged.

## For developers

- **Code folder:** `apps/api/src/engines/ai/agent-builder`
- **API:** [API.md](../API.md), Phase 7 → Agent builder
- **Tables:** `agents` (`instructions`, `tools`, `channels`, `hours`, `status`), `agent_versions`, `agent_runs`.
- **Code:** generalise `apps/api/src/agents` to load an agent definition.
