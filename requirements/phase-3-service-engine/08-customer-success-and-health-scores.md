# Customer success and health scores

**Phase 3 · Service · HubSpot equivalent: Customer success workspace, Health score, Drive retention**

## What it is

For businesses with repeat customers: each customer gets a health score from their purchases, survey answers, tickets
and how recently they bought. A list shows who is at risk and who is due to buy again.

## How it works

1. A gym sees "At risk: 18 members haven't visited in 3 weeks."
2. A hotel sees "Due: 42 guests who stay every December haven't booked yet."
3. Staff or the AI reach out from the list.

## Done when

- [ ] Health scores show their reasons; at-risk and due lists are correct on test data.

## For developers

- **Code folder:** `apps/api/src/engines/service/health`
- **API:** [API.md](../API.md), Phase 3 → Customer success and health scores
- **Code:** `health/score.ts` (pure, unit tested); detects yearly and regular-interval repeat customers.
