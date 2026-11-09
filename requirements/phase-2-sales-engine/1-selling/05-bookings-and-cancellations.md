# Bookings and cancellations

**Phase 2 · Selling · HubSpot equivalent: Orders, Carts, Appointments (closest)**

## What it is

For businesses that sell dated things (rooms, tours, appointments, classes), the AI and staff can check availability,
hold, book, change and cancel, with the business's own cancellation rules and refunds.

## How it works

1. On a call, the AI checks availability, quotes, and books with a hold until payment.
2. The customer pays the link; the booking is confirmed and a confirmation is sent.
3. To change or cancel, the customer uses their personal link or calls; the AI applies the cancellation rules and
   tells them the refund (worked out in code).
4. Unpaid holds expire automatically.

## Rules

- Same flows for every industry; the industry only changes words and the pricing preset.

## Done when

- [ ] Hotel stays and travel packages book, change and cancel correctly against a written set of test cases.
- [ ] A new industry with dated offerings (e.g. a yoga retreat) works with no new code.

## For developers

- **Code folder:** `apps/api/src/engines/sales/bookings`
- **API:** [API.md](../../API.md), Phase 2 → Bookings and cancellations
- **Tables:** `bookings`, `booking_items`, `holds`, `cancellation_policies`, `booking_links`.
- **Code:** customer page `apps/site/app/manage/[token]`; unpaid holds expire in the job runner.
- **Agent tools:** `create_booking`, `modify_booking`, `find_bookings`, `send_cancellation_link`.
