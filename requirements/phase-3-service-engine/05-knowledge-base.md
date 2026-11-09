# Help articles and public help page

**Phase 3 · Service · HubSpot equivalent: Knowledge base (public help centre), Knowledge Base Agent**

## What it is

The Phase 1 [knowledge base](../phase-1-lead-engine/3-ai-agents-and-channels/08-knowledge-base.md) holds everything the
AI knows. Phase 3 adds **help articles** the business publishes on a public help page ("How to reach us",
"Cancellation policy", "Parking"), which customers can read themselves. The AI also answers from them, and suggests new
articles from tickets.

## How it works

1. Manager writes articles, or clicks **Draft from tickets** and the AI drafts one from resolved tickets. FAQs from the
   Phase 1 knowledge base can be turned into articles with one click.
2. Articles appear on the business's help page, searchable, in English, Malayalam and Hindi.
3. The AI uses them on calls, chats and email, alongside the rest of the knowledge base.

## Done when

- [ ] Articles publish to a public help page; the AI answers from them.
- [ ] Draft-from-tickets produces a usable draft for review.

## For developers

- **Code folder:** `apps/api/src/engines/service/knowledge-base`
- **API:** [API.md](../API.md), Phase 3 → Knowledge base
- **Code:** public help page in `apps/site/app/[slug]/help`.
- **Tables:** `kb_articles` (`account_id`, `title`, `body`, `language`, `status`, `views`), `kb_categories`.
  Published articles are added to the Phase 1 search passages.
- **Agent tool:** `search_help_articles`, folded into `search_knowledge`.
