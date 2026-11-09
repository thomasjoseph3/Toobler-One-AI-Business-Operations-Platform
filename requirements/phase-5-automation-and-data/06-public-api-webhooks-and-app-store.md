# Public API, webhooks and app store

**Phase 5 · Data · HubSpot equivalent: Developer tools, API, Webhooks, HubSpot Marketplace, Technology partner program**

## What it is

A documented way for other software to read and write a business's data (with the business's permission), webhooks
that tell other software when something changes, and an app store where partners list their integrations.

## Done when

- [ ] API keys and OAuth apps work with scopes; webhooks deliver with signatures and retries; docs are public.

## For developers

- **Code folder:** `apps/api/src/engines/automation/developer-platform`
- **API:** [API.md](../API.md), Phase 5 → Public API, webhooks and app store
- **Code:** versioned REST API at `/api/v1`; `api_keys`, `oauth_apps`, `webhook_subscriptions`, `webhook_deliveries`;
  rate limits per key; public docs site.
