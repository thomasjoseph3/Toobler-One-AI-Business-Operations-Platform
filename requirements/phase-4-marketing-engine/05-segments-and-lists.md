# Segments and lists

**Phase 4 · Marketing · HubSpot equivalent: Lists (active and static), Segments, Lookalike lists**

## What it is

Groups of contacts for marketing. **Active segments** update themselves ("stayed in December last year, from Kerala,
agreed to WhatsApp"). **Static lists** are fixed. **Lookalikes** find contacts that resemble your best customers.

## How it works

1. Manager builds the segment "December regulars" with filters.
2. It updates daily; campaigns use it.
3. "Find lookalikes" ranks other contacts by how similar they are to won customers, with reasons.

## Done when

- [ ] Segments update correctly; lookalikes show reasons.

## For developers

- **Code folder:** `apps/api/src/engines/marketing/segments`
- **API:** [API.md](../API.md), Phase 4 → Segments and lists
- **Tables:** `segments` (`filters` jsonb, `kind`), reuse `contact_lists`. Lookalike scoring in code from fields and
  history.
