# Data agent

**Phase 7 · AI · HubSpot equivalent: Data Agent, Breeze research, Buyer intent**

## What it is

An AI that researches and answers deeper questions about customers and the business: "Which customers are likely to
book again this quarter and why?", "Summarise everything about Infosys HR before my meeting", "Look up this company's
website and fill in its details."

## Done when

- [ ] Answers cite the records and pages they used; web research fills company fields for approval.

## For developers

- **Code folder:** `apps/api/src/engines/ai/data-agent`
- **API:** [API.md](../API.md), Phase 7 → Data agent
- **Code:** extends `apps/api/src/agents` with web research and multi-step tools; results stored as notes.
