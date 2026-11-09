# Phone menu and call routing

**Phase 3 · Service · HubSpot equivalent: Call routing, Phone trees (IVR), Call queues**

## What it is

Instead of "press 1 for sales", the AI asks what the caller needs and sends them to the right person or team, or
handles it itself. Businesses that want a simple key menu can have one too.

## How it works

1. Caller: "I'm calling about my bill." The AI transfers to billing during office hours, or raises a ticket after.
2. If the team is busy, the caller can wait, get a callback, or continue with the AI.

## Done when

- [ ] Calls route by spoken need to the right number or queue; callbacks are offered when busy.

## For developers

- **Code folder:** `apps/api/src/engines/service/call-routing`
- **API:** [API.md](../API.md), Phase 3 → Phone menu and call routing
- **Code:** transfer targets per team in `agents/voice`; `call_routes` table.
- **Agent tool:** `transfer_to_team`.
