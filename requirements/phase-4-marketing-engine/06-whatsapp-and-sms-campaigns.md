# WhatsApp and SMS campaigns

**Phase 4 · Marketing · HubSpot equivalent: Mobile messaging (WhatsApp, SMS)**

## What it is

Send an approved WhatsApp template or SMS to a segment, with the contact's name and details filled in, now or at a set
time. Replies come into the inbox, and the AI answers them and turns them into leads.

## How it works

1. Manager picks segment "December regulars", template "Christmas offer", sends Friday 10 AM.
2. Messages go out in batches within WhatsApp's limits.
3. 120 people reply. The AI answers each, saves leads, scores them.
4. Report: sent, delivered, read, replied, leads, won, revenue.

## Done when

- [ ] Campaigns send only to consenting contacts, within Meta's limits, and report every step to revenue.

## Better than HubSpot

- Every reply is answered by the AI at once, so a campaign that gets 500 replies doesn't swamp the staff.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/messaging-campaigns`
- **API:** [API.md](../API.md), Phase 4 → WhatsApp and SMS campaigns
- **Tables:** `campaign_sends`, `campaign_messages` (per contact status).
- **Code:** sending queue with rate limits; Meta delivery and read webhooks; SMS provider with DLT templates.
