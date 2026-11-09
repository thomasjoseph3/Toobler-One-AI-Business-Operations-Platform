# Subscription billing

**Phase 1 · Onboarding · HubSpot equivalent: Editions and seats (how HubSpot charges)**

## What it is

How businesses pay us: a free trial, then a monthly or yearly subscription paid by UPI auto-pay or card, with GST
invoices.

## Why it matters

Without it we can't earn from self-serve sign-ups.

## How it works

1. A new business gets a 14-day free trial with everything in Phase 1.
2. Before it ends, the owner gets WhatsApp and email reminders and picks a plan.
3. They pay by UPI auto-pay or card. A GST invoice is emailed each month.
4. If payment fails: reminders for 7 days, then the AI keeps answering but staff screens become read-only until paid.
   (The AI never stops answering their customers.)

## Rules

- Prices and taxes are worked out in code.
- Cancelling keeps data for 90 days, then it is deleted after a final warning.

## Screens

- **Settings → Billing:** plan, next payment, invoices, change card, cancel (with "Are you sure?").

## Done when

- [ ] Trial, paying, failed payment and cancelling all work in the payment provider's test mode.
- [ ] GST invoices are correct for test cases.

## For developers

- **Code folder:** `apps/api/src/core/billing`
- **API:** [API.md](../../API.md), Phase 1 → Subscription billing
- **Provider:** Razorpay Subscriptions.
- **Tables:** `subscriptions` (`account_id`, `plan`, `status`, `trial_ends_at`, `current_period_end`,
  `provider_id`), `billing_invoices`.

## Open questions

- **Price and model:** one price per business (suggested) or per staff login? Monthly price for Phase 1?
- Is there a free plan after the trial (for example, 20 leads a month), like HubSpot's free CRM?
