# Landing pages

**Phase 4 · Marketing · HubSpot equivalent: Landing page builder, A/B testing**

## What it is

Single-page sites for an offer or campaign ("Diwali stay offer"), built from blocks or drafted by AI from a sentence,
with a form and a chat bubble, on the business's own address. Two versions can be tested against each other.

## How it works

1. Manager types "Diwali offer: 20% off 2-night stays, Munnar". The AI drafts a page.
2. Manager edits text and photos, publishes to `offers.business.com/diwali`.
3. A/B: half of visitors see headline A, half B; the better one wins after enough visits.

## Done when

- [ ] Pages publish on a custom address with HTTPS, load fast on phones, and capture leads.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/pages`
- **API:** [API.md](../API.md), Phase 4 → Landing pages
- **Tables:** `pages` (`kind` = `landing`), `page_variants`. Rendered by `apps/site`. Shares the page builder with Phase 6.
