# Workflows

**Phase 5 · Automation · HubSpot equivalent: Workflows, Programmable automation, Lead/ticket/deal automation**

## What it is

"When this happens, do that" rules the business builds itself, on a visual screen, or by describing them to the AI.

**Triggers:** a record is created or changed; a field has a value; a date arrives (birthday, stay date); a form is sent;
a message arrives; a webhook from another app; on a schedule.
**Actions:** send WhatsApp, email or SMS; create a task; set a field; move a stage; assign an owner; add to a list;
start a sequence; wait; branch (if/else); call another app; ask the AI to write or decide something.

## Why it matters

Every business has its own routine. Workflows let it automate that routine without us writing code.

## How it works

1. Manager types: "When a wedding lead is won, send the planning checklist and create a task for Anil 30 days before
   the date."
2. The AI builds the workflow; the manager checks it on screen and switches it on.
3. A history shows every record that went through and what happened.

## Rules

- Workflows can't send marketing without consent.
- A loop guard stops a workflow triggering itself endlessly.
- Phase 1–4 fixed automations become editable workflow templates.

## Done when

- [ ] Every trigger and action works; branches and waits work; history is complete.
- [ ] AI-built workflows match the description in 9 of 10 test cases.

## Better than HubSpot

- Describe a workflow in plain words, in Malayalam, Hindi or English, and the AI builds it.

## For developers

- **Code folder:** `apps/api/src/engines/automation/workflows`
- **API:** [API.md](../API.md), Phase 5 → Workflows
- **Tables:** `workflows`, `workflow_versions` (`definition` jsonb), `workflow_runs`, `workflow_run_steps`.
- **Code:** `apps/api/src/engines/automation/engine` (event bus from repositories, durable job queue, retries).
