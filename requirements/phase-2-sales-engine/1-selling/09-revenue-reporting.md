# Revenue reports

**Phase 2 · Selling · HubSpot equivalent: Revenue reporting, Revenue analytics suite**

## What it is

Reports on money: quoted, won, collected and still owed, by month, by product, by staff member and by channel,
including revenue that came from after-hours leads the AI answered.

## How it works

- **Reports → Revenue** shows each report with a chart and the numbers behind it.
- "AI-saved revenue": sales from leads that first came in outside office hours.

## Rules

- All numbers come from payments and invoices, worked out in code.

## Done when

- [ ] Each report matches a hand count on test data.

## Better than HubSpot

- Shows the revenue the AI brought in after hours, which proves our value to the owner every month.

## For developers

- **Code folder:** `apps/api/src/engines/sales/revenue-reports`
- **API:** [API.md](../../API.md), Phase 2 → Revenue reports
- **Code:** revenue reports in `core/reports`, reading `payments`, `invoices`, `leads`.
