# Invoices and tax

**Phase 2 · Selling · HubSpot equivalent: Invoices, Automated sales tax, Revenue agent (overdue reminders)**

## What it is

GST invoices for every sale, sent automatically when paid, plus invoices for amounts still owed, with polite reminders
until paid.

## How it works

1. A payment is received: a GST invoice (CGST/SGST or IGST by the customer's state) is made and sent on WhatsApp and
   email.
2. For credit sales, staff create an invoice with a due date. Reminders go 3 days before, on the day and 7 days after.
3. The AI answers "Did you get my payment?" and "Send me my invoice" from the invoice record.

## Rules

- Invoice numbers run in order per business per financial year, with no gaps.
- Tax is worked out in code from the business's GSTIN, the customer's state and each product's tax rate.

## Done when

- [ ] Invoices are correct for intra-state, inter-state and no-GSTIN test cases.
- [ ] Reminders stop when paid.

## For developers

- **Code folder:** `apps/api/src/engines/sales/invoices`
- **API:** [API.md](../../API.md), Phase 2 → Invoices and tax
- **Tables:** `invoices`, `invoice_lines`, `invoice_counters` (`account_id`, `fy`, `next`).
- **Code:** PDF generation; reminder job.
- **Agent tool:** `get_invoice`.
