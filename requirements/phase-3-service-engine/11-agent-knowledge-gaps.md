# What the AI couldn't answer: suggested answers

**Phase 3 · Service · HubSpot equivalent: Agent knowledge gaps**

## What it is

Phase 1 already lists the questions the AI couldn't answer, grouped and counted, under **Knowledge base → Unanswered
questions** (see [knowledge base](../phase-1-lead-engine/3-ai-agents-and-channels/08-knowledge-base.md)). Phase 3 adds
a **suggested answer** for each one, drafted from how staff answered the same question in tickets and chats, so the
manager only has to check and accept it.

## How it works

1. **Unanswered questions** shows "Is there EV charging? (asked 14 times this month)" with a suggested answer: "Yes,
   two chargers in the car park, free for guests" (from 3 staff replies).
2. The manager taps **Use this** or edits it. It becomes an FAQ and the AI uses it from the next conversation.

## Done when

- [ ] Suggested answers appear for questions staff have answered before, with the replies they came from.

## For developers

- **Code folder:** `apps/api/src/engines/service/knowledge-gaps`
- **API:** [API.md](../API.md), Phase 3 → What the AI couldn't answer
- **Code:** reads staff replies in tickets and conversations for the same question group; uses the Phase 1
  `unanswered_questions` table.
