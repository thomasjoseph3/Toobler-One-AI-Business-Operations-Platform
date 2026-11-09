# Data quality

**Phase 5 · Data · HubSpot equivalent: Data quality overview, Formatting automation, Required fields, Duplicate management (advanced)**

## What it is

A page showing problems in the data (missing phones, badly formatted names, duplicates, stale records) with one-click
fixes and rules that clean data as it comes in.

## How it works

- "312 contacts have names in capitals. Fix?" → "Priya Nair".
- Rule: always format phones as +91 numbers; always capitalise city names.
- Required fields per stage.

## Done when

- [ ] Each problem type is found and fixed correctly; rules apply on entry.

## For developers

- **Code folder:** `apps/api/src/engines/automation/data-quality`
- **API:** [API.md](../API.md), Phase 5 → Data quality
- **Code:** `apps/api/src/engines/automation/data-quality` checks as a nightly job; fixes in batches with undo via the activity log.
