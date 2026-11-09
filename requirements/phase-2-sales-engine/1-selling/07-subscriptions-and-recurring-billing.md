# Subscriptions and recurring billing

**Phase 2 · Selling · HubSpot equivalent: Subscriptions, Subscription billing**

## What it is

For businesses that charge every month or year (gyms, schools, software, maintenance contracts): a customer signs up to
a plan and is charged automatically, with invoices and reminders.

## How it works

1. Staff create a subscription for a contact: plan, price, start date, how often.
2. The customer approves UPI auto-pay or card once.
3. Each period: charge, invoice, receipt. Failed payments get reminders.
4. Staff can pause, change or cancel (with "Are you sure?").

## Done when

- [ ] Monthly and yearly plans charge, invoice and remind correctly in test mode.

## For developers

- **Code folder:** `apps/api/src/engines/sales/subscriptions`
- **API:** [API.md](../../API.md), Phase 2 → Subscriptions and recurring billing
- **Tables:** `customer_subscriptions`, `subscription_charges`.
- **Provider:** Razorpay Subscriptions / Stripe Billing.
