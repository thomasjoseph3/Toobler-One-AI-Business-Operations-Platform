# Sequences

**Phase 2 · Sales tools · HubSpot equivalent: Sequences, Sales automation (multi-channel)**

## What it is

A planned series of steps for one lead: WhatsApp on day 1, call task on day 3, email on day 5, and so on. Each step can
be sent by the AI, drafted for approval, or be a task for a person. The sequence stops when the customer replies or
books a meeting.

## How it works

1. Manager builds a sequence "After quote": WhatsApp day 1, call task day 3, email day 6, final WhatsApp day 10.
2. Rahul enrols Priya (or a rule enrols every new Quoted lead).
3. Steps run on their days during office hours. Priya replies on day 4; the rest stop.
4. Reports show each sequence's reply and win rates.

## Rules

- Never runs for contacts who said stop. WhatsApp steps outside 24 hours use approved templates.

## Done when

- [ ] All step kinds run on time and stop on reply or meeting booked.
- [ ] Reply and win rates per sequence are reported.

## Better than HubSpot

- Mixes WhatsApp, calls and email in one sequence, and the AI writes each message from the conversation so far.

## For developers

- **Code folder:** `apps/api/src/engines/sales/sequences`
- **API:** [API.md](../../API.md), Phase 2 → Sequences
- **Tables:** `sequences`, `sequence_steps`, `sequence_enrolments`, `sequence_step_runs`; the Phase 1 follow-up plan becomes
  the default sequence.
- **Jobs:** step runner in the job runner.
