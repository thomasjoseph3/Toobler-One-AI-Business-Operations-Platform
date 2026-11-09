# Deal plans and buying groups

**Phase 2 · Sales tools · HubSpot equivalent: Deal plans, Buying groups**

## What it is

For bigger sales with several people involved (a corporate trip, a school contract), staff list who decides, who pays
and who uses it (the **buying group**), and a shared list of steps with dates to close the sale (the **deal plan**).

## How it works

1. On a lead, Rahul adds people: Meera (decides), Anil (pays), Rahul from HR (organises).
2. He adds steps: proposal 10 Nov, visit 15 Nov, sign 20 Nov.
3. Late steps appear on Today.

## Done when

- [ ] Leads can hold several contacts with roles, and a dated step list.

## For developers

- **Code folder:** `apps/api/src/engines/sales/deal-plans`
- **API:** [API.md](../../API.md), Phase 2 → Deal plans and buying groups
- **Tables:** `lead_contacts` (`lead_id`, `contact_id`, `role`), `lead_plan_steps`.
