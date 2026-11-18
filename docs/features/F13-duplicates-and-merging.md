# F13: Duplicates and merging

**Requirements:** `2-crm-core/10-duplicates-and-merging.md`; `requirements/API.md` (Duplicates and merging); docs/plan/PHASE-1.md (F13).
**Depends on:** F04 contacts, F05 companies, F06 leads, F07 timeline, F08 tasks, F14 tickets, F15 conversations, F11 lists.      **Module:** `core.duplicates` (core).
**Status:** `in_progress`, built as ONE unit (owner decision 18 Nov 2026, see CLAUDE.md).

## Feature guide

_(Written before hand-off.)_

## Reused from the hotel agent

Nothing that fits: the old project had no duplicate detection or merge. The "same person" test for an exact phone or email is the one the AI and the import already use (`findContactIdByIdentity`); this feature only handles the people who are *not* an exact match.

## Scope

**In:** a nightly job that finds likely duplicate **contacts** and **companies**; **Contacts → Possible duplicates** (and the same for companies) showing each pair side by side with why they match; **Merge** (pick the record to keep and, for each field that differs, which value to keep) and **Not the same** (never suggested again); the `contact.merged` and `company.merged` events.
**Out:** exact phone/email matches (the database refuses them, the AI and the import join them already); merging leads with each other; undo; merging more than two records at once; AI-written merge advice.

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md as R79)

1. **What counts as "probably the same" (decided in code, never by the AI).**
   Contacts: (a) same name (capitals, spaces and dots ignored) and a *similar phone*: the same last 10 digits, or the same length with one digit different; (b) same name and the same email name before the @ with another domain; (c) same email name before the @ and a similar phone. Companies: (a) same name once words like Pvt, Ltd, Private, Limited, LLP, Inc, Co, Company are dropped; (b) the same phone. (An exact phone or email, or the same company name or domain, can not happen: the database refuses it. The requirement's "same email with different phone" therefore becomes "the same email name with another domain".)
2. **"Not the same" is forever:** the pair row stays with status `dismissed`; the nightly job never makes it open again.
3. **Merging keeps the first-chosen record and moves everything to it** (leads, tasks, notes and timeline, tickets, conversations, list memberships, and for a company its people). The other record is **kept as a deleted row with `merged_into_id`** (not removed), so both originals stay in the database and the activity log records the merge (ids and field *names*, never values). It can not be undone from the app.
4. **One open lead per contact (rule R6):** when *both* contacts have an open lead the merge is refused (409 `BOTH_HAVE_OPEN_LEADS`, in words) until staff close or delete one of them. Closed leads always move. (Alternative if the owner prefers: auto-close the older one as "merged"; not done because it would change a sales record without anyone choosing.)
5. **Who:** list and "Not the same" for any signed-in staff (API.md); **Merge for managers only**. Merging asks "Are you sure?".
6. **Phone and email unique rules:** the merged-away record is marked deleted *first*, so its phone and email are free for the kept record to take, if staff chose them. Staff can keep the phone from one record and the email from the other.
7. **Custom answers:** for each custom field the two records disagree on, staff choose a side; a field only one record has is kept.

## Migration `068_duplicates.sql`

- `duplicate_suggestions` (`id`, `account_id`, `object` contact|company, `a_id`, `b_id` with `a_id < b_id`, `reasons text[]`, `status` open|dismissed|merged, `decided_by jsonb`, `decided_at`, timestamps); unique `(account_id, object, a_id, b_id)`; RLS enabled and forced; business code can insert, set status and decided fields; never delete.
- `contacts.merged_into_id` and `companies.merged_into_id` (same business, composite key), insert/update granted.
- `UPDATE (contact_id)` granted on `leads`, `tasks`, `tickets`, `activities` (for the merge only); conversations already has it.

## Endpoints (`/api/v1`)

| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/duplicates?object=contact\|company` | staff | open pairs with both records' details and the reasons; 400 for a bad `object` |
| POST | `/duplicates/{id}/merge` | manager | body `{ keep: 'a'\|'b', take: { name?, phone?, email?, language?, lifecycleStage?, companyId?, custom?: { key: 'a'\|'b' } } }`; 404 for another business's or an unknown id; 409 `ALREADY_DECIDED`, 409 `BOTH_HAVE_OPEN_LEADS` |
| POST | `/duplicates/{id}/dismiss` | staff | 404, 409 `ALREADY_DECIDED` |

Every route: works / 401 / 403 / 404 / 400 tests, plus isolation entries.

## Jobs and events

`duplicates.detect` (scheduled nightly at 02:30; queues one `duplicates.detect_for_business` per business). Pairs are found by the pure `find-duplicate-pairs.ts` (no database), then saved with "insert if new": safe to run twice. Events `contact.merged` and `company.merged` (`{ keptId, mergedId }`, ids only) go through the outbox.

## Screens (phone first)

Contacts page gets a **Possible duplicates** link with a count; the page lists each pair as a card (stacked on a phone, side by side on desktop) with the reason chips (icon + words), the differing fields highlighted, a choice per field, **Merge** and **Not the same**. The same page works for companies (tab). Empty, loading and error states. All text through `t()`.

## Manual test script

_(Written at hand-off.)_

## Security checklist

_(Ticked at hand-off.)_

## Differences from the requirements

"Same email with different phone" becomes "same email name, other domain" (decision 1); merge is refused when both contacts have an open lead (decision 4).

## Build log

_(Filled in as the feature is built.)_
