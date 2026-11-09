# Attribution and marketing reports

**Phase 4 · Marketing · HubSpot equivalent: Marketing analytics, Advanced marketing reporting, Multi-touch attribution, Pathfinder**

## What it is

Reports that show which channels, campaigns, ads and pages bring leads and revenue, including when a customer touched
several before buying (first touch, last touch, or shared across all). A journey view shows the common paths to a sale.

## How it works

- **Reports → Marketing:** leads and revenue by source, campaign, ad; cost per lead; return on ad spend.
- **Journeys:** "Most December bookings: Instagram ad → website → WhatsApp chat → call."

## Done when

- [ ] Each model's numbers match hand calculations on test journeys.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/attribution`
- **API:** [API.md](../API.md), Phase 4 → Attribution and marketing reports
- **Code:** touchpoints from `web_page_views`, `campaign_messages`, ads, conversations; attribution in
  `apps/api/src/engines/marketing/attribution.ts` (pure, unit tested).
