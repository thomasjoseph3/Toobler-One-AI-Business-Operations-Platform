# Call coaching

**Phase 7 · AI · HubSpot equivalent: Conversation intelligence, Sales methodology scoring, Notetaker**

## What it is

The AI reviews staff calls and meetings: talk-to-listen ratio, questions asked, objections and how they were handled,
whether the business's playbook was followed, and gives each person short coaching tips. Managers see trends across the
team. A notetaker joins online meetings and writes the notes.

## Done when

- [ ] Each staff call gets a score with reasons and tips; managers see team trends.

## Better than HubSpot

- Works on calls in Malayalam and other Indian languages.

## For developers

- **Code folder:** `apps/api/src/engines/ai/coaching`
- **API:** [API.md](../API.md), Phase 7 → Call coaching
- **Code:** analysis on existing transcripts (`calls`); `call_reviews` table; meeting bot via Google Meet/Zoom APIs.
