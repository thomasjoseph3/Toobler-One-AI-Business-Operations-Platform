# Payment links and payments

**Phase 2 · Selling · HubSpot equivalent: Payment links, Payments, Recurring payments**

## What it is

The business collects money through links sent on WhatsApp, email or a quote: UPI, card, net banking. Staff can also
record cash and bank transfers. Every payment shows on the lead and the contact.

## How it works

1. The AI or staff send a payment link for an advance or the full amount.
2. The customer pays by UPI. The payment shows within seconds; the lead moves to Won.
3. Refunds are made from the payment, with a reason (manager only, with "Are you sure?").

## Rules

- Payment amounts come from quotes or the pricing tool, never typed by the AI.
- Each business uses its own payment account (Razorpay or Stripe), or ours where allowed.

## Done when

- [ ] Links, payments, failures and refunds work in test mode for Razorpay and Stripe.
- [ ] Every payment appears on the timeline.

## For developers

- **Code folder:** `apps/api/src/engines/sales/payments`
- **API:** [API.md](../../API.md), Phase 2 → Payment links and payments
- **Tables:** `payments` (`kind` charge or refund, `method`, `status`, `provider_ref`), `payment_links`.
- **Providers:** Razorpay and Stripe; webhooks with signature checks.
- **Agent tools:** `send_payment_link`, `resend_payment_link`.
