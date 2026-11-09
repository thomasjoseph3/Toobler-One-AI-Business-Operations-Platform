# Memberships and content approvals

**Phase 6 · Content · HubSpot equivalent: Memberships (gated content), Content approvals, Multi-language content**

## What it is

Pages only signed-in customers can see (member offers, course material), sign-in by WhatsApp code; a review step so
content is approved before it goes live; and pages in more than one language.

## Done when

- [ ] Gated pages show only to allowed contacts; content needs approval when the rule is on; language versions link.

## For developers

- **Code folder:** `apps/api/src/engines/content/memberships`
- **API:** [API.md](../API.md), Phase 6 → Memberships and content approvals
- **Code:** reuse the Phase 3 portal sign-in; `page_access_rules`, `page_approvals`, `page_translations`.
