# Forecasting and goals

**Phase 2 · Sales tools · HubSpot equivalent: Forecasting, Goals and quotas, Deal splits**

## What it is

Goals per staff member or team (leads contacted, sales won, revenue) and a forecast of this month's revenue from open
leads and their stage.

## How it works

1. Manager sets: Rahul, ₹5 lakh won this month.
2. Reports show progress against goals.
3. The forecast adds up open lead values, weighted by each stage's past win rate (worked out from the business's own
   history, in code).
4. **Split credit:** when two people close a sale together, the manager splits its value between them (e.g. 60/40) for
   goals and reports.

## Done when

- [ ] Goal progress and forecast match hand calculations on test data.

## For developers

- **Code folder:** `apps/api/src/engines/sales/forecast`
- **API:** [API.md](../../API.md), Phase 2 → Forecasting and goals
- **Tables:** `goals` (`account_id`, `user_id` or `team_id`, `metric`, `period`, `target`).
- **Code:** `forecast/forecast.ts` (pure functions, unit tested).
