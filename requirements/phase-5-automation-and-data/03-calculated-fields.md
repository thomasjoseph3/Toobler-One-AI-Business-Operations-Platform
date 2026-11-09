# Calculated fields

**Phase 5 · Data · HubSpot equivalent: Calculated properties, Rollups**

## What it is

Fields worked out from other fields: "Total spent" (sum of won leads), "Days since last visit", "Nights" (end minus
start date).

## Done when

- [ ] Formulas for sum, count, average, min, max, date difference and simple arithmetic update correctly.

## For developers

- **Code folder:** `apps/api/src/engines/automation/formulas`
- **API:** [API.md](../API.md), Phase 5 → Calculated fields
- **Code:** formula parser with a fixed set of functions, evaluated in code, never by the AI.
