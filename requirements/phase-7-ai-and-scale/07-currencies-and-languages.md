# Currencies and languages

**Phase 7 · Scale · HubSpot equivalent: Multiple currencies, Multi-language content and app**

## What it is

Prices and reports in more than one currency (for businesses selling abroad), the app's screens in Indian languages, and
the AI tested and approved in more languages (Tamil, Kannada, Telugu, Arabic for Gulf customers).

## Done when

- [ ] Quotes and invoices in other currencies use set exchange rates, worked out in code.
- [ ] App screens switch language; each new AI language passes the agent test suite before release.

## For developers

- **Code folder:** `apps/api/src/core/currencies`
- **API:** [API.md](../API.md), Phase 7 → Currencies and languages
- **Code:** `amount` columns gain `currency`; `exchange_rates` table; screen text through a translation layer in
  `apps/web`; `agents/languages` gains each language after it passes the evals.
