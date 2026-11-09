# Integrations and data sync

**Phase 5 · Data · HubSpot equivalent: Data sync, App marketplace integrations (Gmail, Outlook, Slack, Shopify, Zapier, Mailchimp…), Cloud data integrations**

## What it is

Ready connections to the apps Indian small businesses use, with two-way sync where it makes sense.

| App | What syncs |
| --- | --- |
| Google Sheets | Contacts, leads both ways |
| Tally, Zoho Books | Customers, invoices, payments |
| Zoho CRM, Salesforce | Contacts, companies, leads both ways (for businesses moving to us) |
| Shopify, WooCommerce | Customers, orders |
| Google Calendar, Outlook | Meetings (Phase 2) |
| Slack, Microsoft Teams | Alerts |
| Booking.com, MakeMyTrip, Airbnb (hotels) | Bookings |
| Zapier, Make | Anything else |
| BigQuery, Snowflake | Full data export for large businesses |

## How it works

1. Manager opens **Integrations**, picks Tally, signs in.
2. Chooses what syncs and which way, and how fields match.
3. A history shows each sync and any errors.

## Done when

- [ ] Each integration syncs test data both ways without duplicates; errors are shown clearly.

## For developers

- **Code folder:** `apps/api/src/engines/automation/integrations`
- **API:** [API.md](../API.md), Phase 5 → Integrations and data sync
- **Tables:** `connections`, `sync_mappings`, `sync_runs`.
- **Code:** one adapter per app in `integrations/<app>`.
