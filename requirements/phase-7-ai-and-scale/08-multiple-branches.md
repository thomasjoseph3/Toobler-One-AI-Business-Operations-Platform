# Multiple branches

**Phase 7 · Scale · HubSpot equivalent: Business units, Brands**

## What it is

One business with several branches or brands (three hotels, five clinics): each branch has its own phone number,
WhatsApp, offerings, hours, staff and reports, while the owner sees everything together.

## Done when

- [ ] Staff see only their branches; the owner sees all; reports filter by branch.

## For developers

- **Code folder:** `apps/api/src/core/branches`
- **API:** [API.md](../API.md), Phase 7 → Multiple branches
- **Tables:** `branches` (`account_id`, name, address, hours, phone number, WhatsApp); `branch_id` on offerings,
  leads, tickets and tasks; branch access on `memberships`.
