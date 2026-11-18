# F12: Import and export

**Requirements:** `2-crm-core/09-import-and-export.md`; `requirements/API.md` (Import and export); docs/plan/PHASE-1.md (F12).
**Depends on:** F04 contacts, F05 companies, F09 custom fields, F11 filters.      **Modules:** `core.imports`, `core.exports` (both core).
**Status:** `in_progress` under the standing instruction, built as ONE unit (owner decision 18 Nov 2026, see CLAUDE.md).

## Feature guide

*(Written in full before hand-off. Plan below.)*

## Reused from the hotel agent

Nothing that fits: the old project had no spreadsheet import. The contact matching (phone, then email) is the one the AI already uses (`findContactIdByIdentity`).

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md as R78)

- **Packages (owner approved 18 Nov 2026):** `@fastify/multipart`, `csv-parse`, `read-excel-file`, exact versions, no install scripts (docs/DEPENDENCIES.md). **Export is CSV** (opens in Excel and Google Sheets; no Excel-writing package).
- **Contacts only for import** (the requirement says "Contacts → Import"). Export covers contacts, companies and leads.
- **Files:** CSV (comma, semicolon or tab, with or without a byte order mark) or Excel .xlsx (first sheet), at most 10 MB, 50,000 rows and 60 columns. The rows wait in the database while the columns are checked and are **deleted when the run ends** (personal data); only the counts and the report of skipped rows stay.
- **A row is matched like the AI does it:** the phone first, then the email. A person already there is **updated, never duplicated**: what the file has fills in what the contact is missing (name, phone, email, language); custom answers in the file are set; a name or detail the contact already has is never replaced; a phone or email that belongs to a DIFFERENT contact is never moved. The same person twice in one file is one contact. Re-importing the same file changes nothing the second time.
- **Skipped rows** (with the reason, never the row's own words): no phone and no email, a phone that is not a number (read in the business's own country when it has no country code), an email that is not valid, a language that is not a two-letter code, a custom answer that does not fit its field. The report lists the first 200; the count of skipped rows is exact.
- **Imported contacts are marked** (`imported_at`, shown as the tag "Imported"); a contact that already existed is not marked.
- **Managers only** for every import and export route; every one is in the activity log (counts and field names, never contents).
- **Export:** the same filters as the list on screen (`filters`, search, status...), a background job writes the CSV, the manager gets an email with a link that works for 24 hours (only the SHA-256 of its random token is stored); cells that start with `=`, `+`, `-` or `@` are written as text so a spreadsheet never runs them as a formula.

## Build order (one unit)

1. Packages (done, 5529508). 2. Migrations 065 (`contacts.imported_at`) and 066 (`imports`, `exports`). 3. Imports backend: reading files, mapping, preview counts, the `imports.run` job, 4 routes. 4. Exports backend: the CSV writer, the `exports.build` job, 3 routes, the nightly purge. 5. Web: the import wizard, Export buttons, the "Imported" tag. 6. All tests (unit, API, isolation, journey, browser, the 10,000-row run). 7. Feature guide, `npm run verify`, approval.

## Build log

**Imports backend (built):** `POST /imports` (multipart upload, managers only: reads CSV or Excel, guesses the columns from their names and from the business's own contact fields, keeps the rows, answers with the preview: column names, first 5 rows, the guess; 400 `EMPTY_FILE`, `INVALID_FILE`, `TOO_MANY_COLUMNS`; 413 `TOO_MANY_ROWS`, `FILE_TOO_LARGE`), `PATCH /imports/{id}` (sets the columns; 400 `INVALID_MAPPING` in words; answers with the counts: new, matching, skipped, and the first reasons; 409 `IMPORT_ALREADY_STARTED`), `POST /imports/{id}/run` (409 `IMPORT_NOT_READY`; the job runs in 250-row chunks, each with its progress in one transaction, so a retried job carries on without duplicating anyone), `GET /imports/{id}` (progress, counts, report). Measured: a 10,000-row file imports in **30.6 s** (limit 120 s), and importing it again adds nobody. Tests: `imports.test.ts` (17), `imports.test.ts` in shared (7), `read-spreadsheet.test.ts` (6), `import-row.test.ts` (4), isolation entries.
