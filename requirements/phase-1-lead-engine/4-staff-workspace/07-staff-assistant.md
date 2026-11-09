# Staff assistant

**Phase 1 · Staff workspace · HubSpot equivalent: Breeze Assistant, Data Agent (basic), Connector for Claude/ChatGPT**

## What it is

An AI assistant inside the admin that staff talk to. It can answer questions about the business's own data and do simple
jobs: "How many hot leads came in this week?", "Show me leads from Infosys", "Add a task to call Priya tomorrow at 10".
The same tools can be used from Claude or other AI apps through our MCP connection.

## Why it matters

Owners who don't want to learn screens can just ask.

## How it works

1. Manager opens the assistant and types or speaks a question.
2. The assistant uses read tools (leads, contacts, tasks, reports) and answers with the numbers and links.
3. For changes (add a task, move a lead), it shows what it will do and waits for **Confirm**.

## Rules

- It can only see and do what the person using it is allowed to.
- Every change it makes is in the activity log, under the person's name, "via assistant".
- Numbers come from tools, never from the AI's own maths.

## Done when

- [ ] Ten common questions answer correctly on test data.
- [ ] Changes need Confirm and appear in the activity log.

## Better than HubSpot

- Works in Malayalam, Hindi and English, and by voice.

## For developers

- **Code folders:** `apps/api/src/agents/assistant`, `apps/mcp`
- **API:** [API.md](../../API.md), Phase 1 → Staff assistant
- **Tools:** `list_leads`, `get_lead`, `search_contacts`, `list_tasks`, `create_task`, `move_lead`, `add_note`,
  `get_report`. The MCP server in `apps/mcp` serves the same tools to Claude and other AI apps.
- **Table:** `assistant_chats`.
