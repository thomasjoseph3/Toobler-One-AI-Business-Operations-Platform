# Reports and dashboard

**Phase 1 · Staff workspace · HubSpot equivalent: Reporting dashboard, Sales analytics (basic)**

## What it is

A **Reports** page with the numbers a small business owner cares about, for any date range, worked out in code.

| Report | Shows |
| --- | --- |
| Leads by channel | How many came from calls, WhatsApp, chat, email |
| Leads by time of day | How many came after hours (what the AI saved you) |
| Speed to first call | Average and slowest time from lead to first staff contact |
| Funnel | New → Contacted → Quoted → Won, with drop-off between stages |
| Won and lost | Count, and lost reasons |
| By staff member | Leads, contacted, won, late callbacks |
| By offering | Which offerings get the most enquiries and wins |

## Why it matters

The owner sees what the product is worth to them ("62 leads came after hours this month") and where the team is
slow.

## How it works

1. Manager opens **Reports**, picks "This month".
2. Each report shows a chart and the numbers; tap a bar to see the leads behind it.
3. **Export** downloads the numbers.
4. A weekly summary goes to the owner on WhatsApp every Monday.

## Rules

- All numbers are computed in code from the database, never by the AI.
- A custom report builder comes in Phase 5.

## Done when

- [ ] Every report matches a hand count on test data.
- [ ] Reports load in under 2 seconds for a year of data.

## For developers

- **Code folder:** `apps/api/src/core/reports`
- **API:** [API.md](../../API.md), Phase 1 → Reports and dashboard
- **Code:** each report is a query plus a pure function, with a unit test against hand counts.
