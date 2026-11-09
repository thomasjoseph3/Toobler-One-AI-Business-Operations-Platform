# Quotes

**Phase 2 · Selling · HubSpot equivalent: Sales quotes, CPQ**

## What it is

A quote is a priced offer sent to the customer: products, quantities, dates, discounts, taxes, total, validity, terms,
and a "Pay now" or "Accept" button.

## How it works

1. From a lead, Rahul clicks **New quote**, adds products; prices and tax fill in from the price list.
2. He sends it by WhatsApp or email. The customer opens a branded page.
3. The customer taps **Accept** (and pays an advance if set). The lead moves to Won.
4. The AI can also send a quote during a call or chat: "I've sent you the quote on WhatsApp."

## Rules

- Totals are worked out in code. A quote's prices are fixed once sent.
- Quotes expire on their validity date; the customer sees "expired, ask for a new one".

## Done when

- [ ] Staff and the AI can create and send a quote; the customer can view, accept and pay.
- [ ] Opening, accepting and paying appear on the timeline.

## Better than HubSpot

- The AI creates and sends quotes itself, during the conversation.

## For developers

- **Code folder:** `apps/api/src/engines/sales/quotes`
- **API:** [API.md](../../API.md), Phase 2 → Quotes
- **Tables:** `quotes` (`lead_id`, `number`, `status`, `valid_until`, `totals` jsonb, `public_token`), `quote_lines`.
- **Code:** public quote page in `apps/site/app/q/[token]`; PDF generation.
- **Agent tool:** `send_quote`.
