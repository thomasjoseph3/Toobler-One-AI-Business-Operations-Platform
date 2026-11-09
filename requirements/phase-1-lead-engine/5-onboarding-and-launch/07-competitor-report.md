# Competitor report

**Phase 1 · Onboarding · HubSpot equivalent: none (closest: Market and competitor research in Breeze)**

## What it is

An optional report for the owner that compares their business with up to three competitors they name: what each one
sells, the prices they show publicly, how customers can reach them, their Google rating, and simple suggestions for
the owner.

## Why it matters

Owners want to know how they compare. It gives them a useful answer on day one, before any leads have arrived, and
shows where our AI already gives them an edge ("None of your competitors answer WhatsApp at night").

## How it works

1. In setup (or later from **Reports → Competitors**), the owner adds up to three competitor websites or Google
   listings.
2. We read their public pages in the background, so setup isn't slowed down.
3. Within an hour the report is ready. The owner gets it on WhatsApp and in the app.

**What the report shows, for the business and each competitor:**

| Part | Example |
| --- | --- |
| What they sell | "4 room types, a family package, airport pick-up" |
| Prices shown publicly | "From ₹3,200 a night" (or "No prices shown") |
| How customers can reach them | Phone, WhatsApp button, website chat, email, hours shown |
| Google rating | 4.3 from 812 reviews |
| What customers praise or complain about | From public reviews, in a few words |
| Suggestions for you | "Your from-price is ₹300 higher than the average shown: say what's included." "Two competitors list a pool; add yours to your website." |

## Rules

- Only public information is used. We respect each website's rules for automated reading.
- Price comparisons are worked out in code, never by the AI.
- The report is for the owner and managers only. It is **never** added to the knowledge base and the AI **never**
  mentions competitors or their prices to customers.
- **Refresh** can be used once a month.

## Screens

- **In setup:** an optional step "Who are your main competitors?" with up to three links, and **Skip**.
- **Reports → Competitors:** the business and each competitor side by side (on a phone, one card each), suggestions at
  the bottom; **Refresh**, **Change competitors**.

## Done when

- [ ] A report is produced for test competitors within an hour, with every part filled or marked "not found".
- [ ] Price comparisons match a hand calculation.
- [ ] In agent tests, the AI never names a competitor or their prices.

## For developers

- **Code folder:** `apps/api/src/core/competitors`
- **API:** [API.md](../../API.md), Phase 1 → Competitor report
- **Tables:** `competitors` (`account_id`, `name`, `url`, `kind`), `competitor_reports` (`account_id`, `data` jsonb,
  `created_at`).
- **Reading:** the same website reader as [business questions](../3-ai-agents-and-channels/09-business-questions.md);
  Google Places API for rating and reviews.
- **Job:** builds the report in the background, then sends a WhatsApp template `competitor_report_ready`.

## Open questions

- Should the report be free for everyone, or a reason to pick a paid plan?
