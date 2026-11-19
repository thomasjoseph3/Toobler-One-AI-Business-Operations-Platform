# F12: Import and export

**Requirements:** `2-crm-core/09-import-and-export.md`; `requirements/API.md` (Import and export); docs/plan/PHASE-1.md (F12).
**Depends on:** F04 contacts, F05 companies, F09 custom fields, F11 filters.      **Modules:** `core.imports`, `core.exports` (both core).
**Status:** `approved` (18 Nov 2026, verify green: 2912 unit/API, 752 e2e), built as ONE unit (owner decision 18 Nov 2026, see CLAUDE.md).

## Feature guide

**What it does.** A business can bring in the customers it already has from a spreadsheet (Excel or CSV), and take any list out again as a spreadsheet. **Import** (Contacts → Import): choose a file, see which column the system thinks is the name, phone, email, company and so on (and fix any wrong guess), see how many people would be new, how many are already in your contacts and how many rows would be skipped, then press Import and read the report. **Export** (the Export button on Contacts, Companies and Leads): you get a CSV file of exactly what the list on your screen shows, with your own custom fields, by email and as a download.

**Why it is useful.** Every business already has customers somewhere: a notebook, an Excel sheet, a phone. Starting from zero is a reason not to switch. And a business must always be able to take its own data away.

**A day in the life.** Meera's school has 1,300 families in an Excel sheet. She opens Contacts → Import, chooses the file, and sees "1,240 new contacts, 46 match contacts you already have (they will be updated, not added twice), 14 rows will be skipped." She fixes one column that was guessed wrong, presses Import, watches the progress bar, and reads that row 5 had a phone number that is not a number. She fixes the sheet and imports it again: nobody is added twice. Later she filters Contacts by "Car model is Swift", presses Export, and gets an email with a link to a file that has exactly those people.

**Who can do what.** Only **managers** can import and export. Staff see no Import or Export button, and the routes refuse them.

**Settings and limits.** A file can be CSV or Excel (.xlsx), up to 10 MB, 50,000 rows and 60 columns. A person already in your contacts is found the way the AI finds them (the phone, then the email), updated and never added twice: the file fills in what the contact is missing (name, phone, email, language) and sets the custom answers it has; a name or detail a contact already has is never replaced, and a phone or email that belongs to a different contact is never moved. People made by an import are tagged **Imported** (so they can be told apart when marketing arrives in a later phase). An export holds at most 50,000 rows and the file is kept for 24 hours.

**What it never does.** It never imports anything until you press Import. It never makes a duplicate. It never guesses at a phone number, email or language it cannot read: the row is skipped and the report says why (never repeating what the row held). The rows of your file are deleted from our database as soon as the import ends; only the counts and the report stay. An export cell that begins like a spreadsheet formula (=, +, -, @) is written as plain text, so opening the file can never run anything; phone numbers come out exactly as they are in the system.

**Not part of it.** Importing companies, leads or tickets (only contacts so far); exporting as an Excel (.xlsx) file (CSV opens in Excel and Google Sheets); a "Delete the import" undo; exporting tickets, tasks or notes; sending marketing messages (Phase 4).

### For the tech team

Modules `core.imports` and `core.exports` (core; each requires auth, contacts, companies and fields; exports also leads). Tables `imports` and `exports` (migrations 066 and 067) and `contacts.imported_at` (065). Routes (all `manager`): `POST /imports` (multipart), `PATCH /imports/{id}`, `POST /imports/{id}/run`, `GET /imports/{id}`; `POST /exports`, `GET /exports/{id}`, `GET /exports/{id}/download`. Jobs: `imports.run` (250-row chunks, each with its progress in one transaction, so a retry resumes), `exports.build`, and `exports.purge_expired` (hourly, one `exports.purge_expired_for_business` per business). The row matching is `applyImportedContact` in the contacts module (`index.ts`); each list module reads its own rows for export (`findContactsForExport`, `findCompaniesForExport`, `findLeadsForExport`) through the same filter reader as the list. The CSV writer is `apps/api/src/kernel/csv/write-csv.ts`. Packages: `@fastify/multipart`, `csv-parse`, `read-excel-file` (docs/DEPENDENCIES.md). Measured: a 10,000-row file imports in about 30 s locally (limit 120 s). Known limits: the import's upload and rows live in a jsonb column (10 MB file limit keeps it small); an export's bad `filters` only fails when the file is built (the screen always sends the list's valid ones); times in an export are UTC dates.

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
