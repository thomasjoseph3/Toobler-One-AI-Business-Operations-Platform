# Custom objects

**Phase 5 · Data · HubSpot equivalent: Custom objects, Associations with labels, Record page layouts**

## What it is

Businesses add their own kinds of records beyond contacts, companies and leads: a car dealer adds "Vehicles", a school
adds "Students", a property agent adds "Properties". Each has its own fields, list, page and links to contacts and
leads, with named links ("buyer", "seller").

## How it works

1. Manager creates object "Property" with fields: area, price, bedrooms, status.
2. Links properties to leads as "interested in".
3. The manager arranges which fields show, in what order, on each record page (for built-in objects too).
4. The AI can read properties ("Do you have a 3-bedroom in Kakkanad?") if the manager allows.

## Done when

- [ ] Custom objects have list, page, fields, links, views, import and export, and work in workflows and reports.

## For developers

- **Code folder:** `apps/api/src/engines/automation/objects`
- **API:** [API.md](../API.md), Phase 5 → Custom objects
- **Tables:** `object_definitions`, `object_records` (`custom` jsonb), `record_links` (`from`, `to`, `label`).
