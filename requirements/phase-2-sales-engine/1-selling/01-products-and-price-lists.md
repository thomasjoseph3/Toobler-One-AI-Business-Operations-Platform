# Products and price lists

**Phase 2 · Selling · HubSpot equivalent: Products library, Multiple currencies (basic)**

## What it is

Phase 1 offerings grow into full products: exact prices (not only "from"), variants (room type and season, tour and
date), tax rate, stock or availability where it applies, and price lists for different seasons or customer groups.

## Why it matters

To quote and take payment, the system needs exact prices, worked out the same way every time.

## How it works

1. The manager opens **Products**, edits "Deluxe room": ₹4,500 a night, ₹5,500 in Dec–Jan, 12% GST, 10 rooms.
2. The AI, asked "How much for 3 nights from 20 Dec for 2 rooms?", calls the pricing tool, which works out the exact
   total in code, and the AI reads it out.
3. Staff use the same products when building quotes.

## Rules

- The AI never calculates; it only reads out what the pricing tool returns.
- Each industry's pricing rules (per night, per person, child age bands, single supplement) live in one general pricing
  engine with industry presets.

## Done when

- [ ] Per-night, per-person, child age band and single-supplement pricing give the right totals for a written set
      of test cases.
- [ ] A new industry (e.g. a clinic's per-visit price) works with no new code.

## Better than HubSpot

- Prices are spoken correctly on calls by the AI, in Malayalam, Hindi or English.

## For developers

- **Code folder:** `apps/api/src/engines/sales/products`
- **API:** [API.md](../../API.md), Phase 2 → Products and price lists
- **Tables:** `products`, `product_variants`, `price_lists`, `price_list_items`, `inventory` (where stock applies).
- **Agent tools:** `check_availability`, `price_quote`.
