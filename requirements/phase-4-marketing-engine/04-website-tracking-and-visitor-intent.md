# Website tracking and visitor intent

**Phase 4 · Marketing · HubSpot equivalent: Tracking code, Audience segments (anonymous visitors), Lead source tracking**

## What it is

A small script on the business's website records the pages a visitor looks at and where they came from (Google, an
ad, Instagram). When the visitor becomes a contact, their past visits are joined to their record.

## How it works

1. Priya visits from a Google ad, looks at "Deluxe room" and "Pool".
2. She chats and gives her phone. Her contact now shows: "Came from Google Ads, campaign Dec-stays; viewed Deluxe
   room, Pool."
3. Staff see what she's interested in before calling.

## Rules

- A cookie banner asks visitors before tracking where the law requires.

## Done when

- [ ] Visits join to the contact on conversion; source and campaign are saved on the lead.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/tracking`
- **API:** [API.md](../API.md), Phase 4 → Website tracking and visitor intent
- **Tables:** `web_visitors`, `web_page_views`; first-party cookie; UTM capture.
