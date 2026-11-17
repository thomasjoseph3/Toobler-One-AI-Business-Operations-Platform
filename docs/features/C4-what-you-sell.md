# C4: What you sell screen (UI catch-up block, R64)

**Where:** `/knowledge/what-you-sell` ("What you sell"), one of the three tabs at the top of the Knowledge base (Business profile, What you sell, Test the agent). **Uses only existing routes:** `GET/POST /offerings`, `PATCH/DELETE /offerings/{id}`, `POST /offerings/reorder`, `GET/POST /offers`, `PATCH/DELETE /offers/{id}`, `GET /knowledge/prefill/{id}`.
**Status:** built 17 Nov 2026, waiting for the owner's check. Screenshots: `docs/features/C4-what-you-sell/`.

## Feature guide

**What it does.** The list of everything the business sells, and the offers running now. Each item has a name, a short description, an optional **"from" price** (with what it is for, like "per night", and whether GST is included, extra or none), what is included, a season note and extra details (check-in time...). The owner can add, change, switch on or off, move up or down, and delete. Below it, **offers** are time-limited promotions ("10% off in December") with a last day.

**Why it helps.** The AI agent quotes **only** what is on this page, and only as a "from" price: it never works out a total. So this page is where the owner makes sure customers hear the right prices. Switching something off stops the AI mentioning it without losing it. It also completes the profile question "What do you sell?" and the setup step of the same name.

**From the website.** If the owner read their website on the Business profile page, this page offers what the reading found ("Your website seems to sell these"). Pressing **Add this** opens the form already filled in. The unit ("per night") and the GST note are left for the owner to choose: nothing about money is guessed.

**A day in the life.** Anita opens What you sell and sees two suggestions from her website. She adds "Sea view room" at ₹2,500, chooses "per night" and "GST is extra". She switches off "Yoga class" for the monsoon, and moves "Deluxe room" to the top. She adds the offer "Monsoon: free breakfast" until 30 Sep. When a customer asks the agent, it says "from ₹2,500 per night plus GST", mentions the offer, and says the team will confirm the exact price.

**Who can do what.** Managers do everything. Other staff can read both lists.

**Rules.** Money is typed as rupees and kept as whole paise. A price needs its unit and its GST note, or none of the three. An offer's last day cannot be in the past (counted in the business's own time zone) and it stays on through the end of that day. Deleting asks "Are you sure?" and names the item. Ended offers are hidden unless asked for.

**Never does.** It never adds a suggestion by itself, never guesses a unit or GST note, and the AI never adds prices up.

**Not part of it.** Importing a price list, offering owners (who follows up leads for an item), and photos.

## For the tech team
- Code: `apps/web/src/features/what-you-sell/`: pure logic with tests (`offering-form.ts` form ⇄ API request and "only what changed", `offer-form.ts` dates in the business's time zone, `list-helpers.ts` reorder and suggestion filtering) and the screens (`WhatYouSellPage`, `OfferingsCard`, `OfferingFormPanel`, `SuggestionsCard`, `OffersCard`). `KnowledgeTabs` is shared by the three Knowledge base pages.
- Suggestions: the Business profile page remembers the id of the last reading in this browser (`localStorage`, ids only, per business, wrapped so a blocked storage only loses the offer: `knowledge/last-reading.ts`, with tests) and this page reads that run with `GET /knowledge/prefill/{id}`. There is no "list my readings" route; if you want suggestions to follow the owner across devices that route would be a small backend addition.
- Fixed on the way: links inside sentences are now underlined (an accessibility finding: a link must not be told apart by colour alone).
- Tests: 17 unit tests (forms, dates, lists), 3 for the remembered reading; 36 browser tests at phone and desktop (`e2e/what-you-sell.spec.ts`, pretend API in `e2e/pretend-sales.ts`) including an accessibility check; the shell, accessibility, Business profile, Setup guide and Test the agent tests still pass (230 together).

## Manual test script (real app, manager login)
1. Open Knowledge base, then the **What you sell** tab.
2. Press **Add something you sell**. Leave the name empty and Save: it asks for a name. Fill the name, tick "I share a from price", enter 4500, choose "per night" and "GST is extra", Save. It appears with "from ₹4,500 per night plus GST".
3. Press **Switch off**, then **Switch on** on it. Use the up and down arrows to reorder.
4. Press **Edit**, change only the name, Save. Then edit again and untick "I share a from price": the price goes away.
5. Press **Delete**: a box names it and asks "Are you sure?". Cancel keeps it.
6. Add an offer with a last day in the past: it refuses. Use a future date. Tick "Show offers that have ended" to see old ones.
7. On the Business profile, read your website, then open What you sell: the suggestions show. Add one: check the form arrives filled in, choose the unit and GST, save.
8. Ask the agent about the price in Test the agent: it says "from …".
9. Sign in as staff: you can read, and no buttons show. Try a phone width.

## Known limits / notes for the designer
- Designed by us in the Leads screens' style (flag in docs/FRONTEND.md §5). Up and down arrows move items (no drag and drop).
