# Import and export

**Phase 1 · CRM core · HubSpot equivalent: Import tools, CRM import, Export**

## What it is

A business can bring in its existing customers from a spreadsheet (Excel or CSV), and download any list as a
spreadsheet.

## Why it matters

Every business already has customers somewhere: a notebook, Excel, a phone's contacts. Starting from zero is a reason
not to switch. And a business must always be able to take its data away.

## How it works

1. Manager opens **Contacts → Import**, uploads `customers.xlsx`.
2. We show the first rows and guess which column is name, phone, email, company and which custom field.
3. The manager fixes any guesses and sees: "1,240 new, 86 match existing contacts (will be updated), 12 rows have no
   phone or email (skipped)".
4. They click **Import**. A report lists anything skipped and why.
5. Any list or view has **Export**, which emails a spreadsheet link to the person who asked.

## Rules

- Imports match existing contacts the same way the AI does (phone, then email), so no duplicates are made.
- Imported contacts are marked "Imported", and are never sent marketing messages without consent (Phase 4).
- Every import and export goes in the activity log. Only managers can export.

## Done when

- [ ] A 10,000-row file imports in under two minutes, with a clear report.
- [ ] Re-importing the same file creates no duplicates.
- [ ] Export downloads exactly what the view shows, including custom fields.

## For developers

- **Code folder:** `apps/api/src/core/imports`
- **API:** [API.md](../../API.md), Phase 1 → Import and export
- **Tables:** `imports` (`account_id`, `object`, `file_name`, `mapping` jsonb, `status`, counts, `report` jsonb,
  `by_user_id`).
