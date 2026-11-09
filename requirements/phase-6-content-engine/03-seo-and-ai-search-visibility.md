# SEO and AI search visibility

**Phase 6 · Content · HubSpot equivalent: SEO recommendations, AEO (answer engine optimisation), AEO Grader, AI Search Sensor**

## What it is

Checks and suggestions so the business's pages show up on Google and in AI answers (ChatGPT, Gemini, Perplexity), plus a
tracker that shows whether AI assistants mention the business when asked "best resort in Munnar".

## Done when

- [ ] Each page shows fixable SEO problems; the tracker checks set questions weekly and reports mentions.

## For developers

- **Code folder:** `apps/api/src/engines/content/seo`
- **API:** [API.md](../API.md), Phase 6 → SEO and AI search visibility
- **Code:** page checks in `apps/site`; scheduled AI-answer checks per business; `visibility_checks`.
