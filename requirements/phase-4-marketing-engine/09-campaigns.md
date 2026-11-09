# Campaigns

**Phase 4 · Marketing · HubSpot equivalent: Campaigns, Campaign Agent**

## What it is

A campaign groups everything for one goal ("Christmas 2026"): WhatsApp sends, emails, landing pages, forms, ads and
posts, with one budget and one report. The AI can plan a campaign from a goal.

## How it works

1. Manager types: "Fill 30 rooms for Christmas week, budget ₹20,000."
2. The AI drafts: segment, 2 WhatsApp sends, a landing page, an Instagram ad, dates. Manager edits and approves.
3. One report shows leads and revenue from all parts.

## Done when

- [ ] Every send, page, form and ad can be tagged to a campaign; the report adds them up correctly.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/campaigns`
- **API:** [API.md](../API.md), Phase 4 → Campaigns
- **Tables:** `campaigns`, `campaign_assets` (`campaign_id`, `kind`, `ref_id`).
