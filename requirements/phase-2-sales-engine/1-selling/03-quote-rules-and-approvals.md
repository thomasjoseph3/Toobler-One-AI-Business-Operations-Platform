# Quote rules and approvals

**Phase 2 · Selling · HubSpot equivalent: Quote rules, Advanced quote approvals, Discount guardrails (CPQ)**

## What it is

Limits on quotes set by the manager: the largest discount each role can give, minimum prices, required fields. Quotes
outside the limits need a manager's approval before they can be sent.

## How it works

1. Manager sets: staff can give up to 10% off; more needs approval.
2. Rahul gives 15%. The quote shows "Needs approval" and the manager gets a WhatsApp with Approve and Reject.
3. Approved: the quote can be sent.

## Rules

- The AI can never give a discount unless a rule allows it for that offering.

## Done when

- [ ] Out-of-limit quotes can't be sent until approved.
- [ ] Approvals are recorded on the timeline with who approved.

## For developers

- **Code folder:** `apps/api/src/engines/sales/quote-rules`
- **API:** [API.md](../../API.md), Phase 2 → Quote rules and approvals
- **Tables:** `quote_rules` (`account_id`, `role`, `max_discount_pct`, `min_price` per product), `quote_approvals`.
