# Business info and offerings

**Phase 1 · AI agents · HubSpot equivalent: Products (basic), Company settings**

## What it is

Two of the most used parts of the [knowledge base](08-knowledge-base.md):

- **Business info (the business profile):** name, what the business does, address, map link, hours, contact numbers,
  languages, payment methods, policies and GST details. It is built from the answers to the
  [business questions](09-business-questions.md).
- **Offerings:** what the business sells. Each has a name, a description, a **"from" price** and its unit (per night,
  per person, per package, per visit), what's included, and a few extra details. A room type, a tour, a course or a
  service all fit.

## Why it matters

Most customer questions are "how much?", "what's included?" and "when are you open?". These two parts answer them.

## How it works

1. In setup, **Fill from website** (or the Google listing, or an uploaded rate card) drafts the business info and
   offerings.
2. The owner checks and edits them, answering any questions we couldn't fill.
3. For prices, the owner also says whether GST is included or extra, whether prices change by season, and any current
   offers.
4. Asked "How much is a family room?", the AI says "Our family room is from ₹4,500 a night plus GST, with breakfast
   included. Our team will confirm the exact price for your dates."

## Rules

- The AI only says what is written here. Nothing invented.
- Prices are always "from" prices, with the GST note. The AI never works out a total and never adds GST.
- Seasonal prices and offers are said in the owner's own words ("Prices are higher in December and January"); the AI
  doesn't calculate them.
- An offering switched off is never mentioned. An offer past its end date is never mentioned.

## Screens

- **Knowledge base → Business profile:** see [business questions](09-business-questions.md).
- **Knowledge base → Offerings:** list with name, from-price, unit, GST note, on/off; add, edit, reorder, remove (with
  "Are you sure?"). Each offering opens a form: name, description, from-price, unit, what's included, extra details,
  photo.
- **Test the agent:** a chat panel on both tabs.

## Done when

- [ ] Fill from website drafts info and offerings for 8 of 10 real test websites without errors.
- [ ] The completeness score updates as fields are filled.
- [ ] The AI answers a price question with the from-price, the GST note and what's included, and never a total.

## Better than HubSpot

- Set up by pasting a website or a photo of a rate card, in minutes.

## For developers

- **Code folders:** `apps/api/src/core/knowledge`, `apps/api/src/core/offerings`
- **API:** [API.md](../../API.md), Phase 1 → Knowledge base, and Business info and offerings
- **Tables:** `business_answers` (see [knowledge base](08-knowledge-base.md)); `offerings` (`account_id`, `name`,
  `description`, `from_price` (paise), `price_unit`, `gst_mode` (`included`, `plus`, `none`), `season_note`,
  `includes`, `details` jsonb, `photo_key`, `active`, `sort`); `offers` (`account_id`, `text`, `ends_on`).
- **Fill from website:** `core/knowledge/website-import.ts` reads the site and drafts answers and offerings.
- **Completeness score:** `core/knowledge/completeness.ts`.
- **Agent tools:** `get_business_info`, `list_offerings`.
