# Feedback surveys

**Phase 3 · Service · HubSpot equivalent: Feedback management (NPS, CSAT, CES surveys)**

## What it is

Short surveys sent on WhatsApp or email after a sale, a stay or a ticket: "How likely are you to recommend us, 0–10?"
(NPS), "How happy were you?" (CSAT), "How easy was it?" (CES). Unhappy answers raise a ticket at once.

## How it works

1. Priya checks out. Next morning she gets a WhatsApp: "How was your stay? Reply 1–5."
2. She replies 2. A ticket is raised for the manager and the AI asks what went wrong.
3. Happy customers (4–5) get a link to leave a Google review.

## Done when

- [ ] Surveys send on the set trigger; answers record on the contact; low scores raise tickets.
- [ ] Reports show NPS, CSAT and CES over time.

## Better than HubSpot

- Collected by WhatsApp reply, which gets far more answers than an email survey; happy customers are sent to Google
  reviews.

## For developers

- **Code folder:** `apps/api/src/engines/service/surveys`
- **API:** [API.md](../API.md), Phase 3 → Feedback surveys
- **Tables:** `surveys`, `survey_responses`.
- **Templates:** WhatsApp Utility templates per survey.
