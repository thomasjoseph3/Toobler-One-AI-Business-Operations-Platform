# F13: Duplicates and merging

**Requirements:** `2-crm-core/10-duplicates-and-merging.md`; `requirements/API.md` (Duplicates and merging); docs/plan/PHASE-1.md (F13).
**Depends on:** F04 contacts, F05 companies, F06 leads, F07 timeline, F08 tasks, F14 tickets, F15 conversations, F11 lists.      **Module:** `core.duplicates` (core).
**Status:** `approved` (18 Nov 2026, verify green: 766 e2e), built as ONE unit (owner decision 18 Nov 2026, see CLAUDE.md).

## Feature guide

**What it does.** Every night the system looks through your contacts and your companies for records that are probably the same one: "Anil Kumar" saved twice with phone numbers one digit apart, or "Infosys" and "Infosys Pvt Ltd". They show up under **Contacts → Possible duplicates** (and **Companies → Possible duplicates**), side by side, with the reason they look alike. A manager chooses which record to keep and, for each detail where the two differ, which value is right, and presses **Merge**. Anyone on the team can press **Not the same**, and that pair is never suggested again.

**Why it is useful.** People change numbers, use a spouse's phone or give an office email once. Two records for one person split their history and make reports wrong. Merging puts everything in one place.

**A day in the life.** Meera opens Contacts the morning after a busy weekend and sees "Possible duplicates". There is one pair: "Anil Kumar, +971 50 123 4567" and "Anil Kumar, +971 50 123 4568 (anil@example.com)". The reason says "Same name and a similar phone number". She knows him: the second number is his new one. She keeps the first record, picks the second phone number and the email, presses Merge and answers "Are you sure?". His lead, the task to call him, his notes, the complaint ticket, his chats and the list he is on are all on one Anil now.

**Who can do what.** Everyone signed in can see the pairs and press **Not the same**. Only **managers** can merge, because a merge cannot be undone.

**Settings and limits.** Nothing to set up. The search runs every night at 2:30. Two records are suggested when: contacts have the same name (capitals, spaces and dots ignored) and a similar phone (same last 10 digits, or one digit different), or the same name and the same email name before the @ with another domain, or the same email name and a similar phone; companies have the same name apart from Pvt, Ltd, Limited, Inc and the like, or the same phone. Names like "Guest" that hundreds of records share are ignored. The screen shows the oldest 100 open pairs. If **both** contacts have an open lead, a merge is refused until one of the two leads is closed or deleted (a person has at most one open lead).

**What it never does.** It never merges anything by itself: a person always decides. It never suggests a pair you said is not the same. It never deletes anything: the record that was merged away is kept (hidden) and points at the one it was merged into, and the activity log records both (which record was kept, which was merged away, and the names of the fields taken from the other, never their contents). Exact matches (the same phone or the same email) never reach this page: they are joined automatically when a contact is made.

**Not part of it.** Undoing a merge; merging more than two records at once; merging leads with each other; merging tickets, tasks or companies' custom fields by hand; suggestions for leads.

### For the tech team

Module `core.duplicates` (core; requires auth, contacts, companies, leads, tasks, tickets, activities, conversations, lists, fields). Table `duplicate_suggestions` and `contacts|companies.merged_into_id` (migration 068, which also grants `UPDATE (contact_id)` on leads, tickets, tasks and activities, only used by each module's own `move...ToContact`). Routes: `GET /duplicates?object=contact|company` (staff), `POST /duplicates/{id}/merge` (manager; `{ keep: 'a'|'b', take: {...} }`), `POST /duplicates/{id}/dismiss` (staff). Jobs: `duplicates.detect` (02:30, one `duplicates.detect_for_business` per business). Events: `contact.merged`, `company.merged` (`{ keptId, mergedAwayId }`). Log kinds: `contacts.merged`, `contacts.merged_away`, `companies.merged`, `companies.merged_away`, `duplicates.dismissed`. How it works: `find-duplicate-pairs.ts` (pure) groups records by an exact key (name, email name, phone, company core name) and compares only inside a group (10,000 contacts take well under a second); pairs are saved with "insert if new, refresh reasons if still open, leave decided pairs alone". A merge runs in one transaction: lock the suggestion, lock both contacts (sorted ids), refuse when both have an open lead, mark the loser deleted with `merged_into_id`, give the kept record the chosen values (the loser's row goes first so its phone, email, name and domain are free), move leads, tasks, tickets, notes/timeline, conversations and list memberships (each owning module's own function), close other open suggestions about the loser, write the log lines and the event. Known limits: a pair whose records stop matching (a phone corrected) stays open until a record is deleted or merged; the list shows the oldest 100; an exact-match duplicate created through an old import is not a case (the database refuses it).


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

Log in as the manager of a test business (or use the dev business).
1. **Make a pair.** Contacts → Add: "Anil Kumar", +971 50 123 4567. Add again: "anil kumar", +971 50 123 4568, email anil@example.com. Give the second one a lead, a task and a note.
2. **Find it.** The search runs at 02:30; to see it now run `npm run duplicates:detect -- --email <the manager's email>`. Expected: "1 new possible duplicate found", and Contacts → **Possible duplicates** shows the pair with "Same name and a similar phone number".
3. **Not the same.** On a second pair press **Not the same**. Expected: it disappears with a confirmation, and after the next night run it is still gone.
4. **Merge.** Keep the first record, pick the second phone number, press **Merge**. Expected: "Are you sure?" names both; after Merge: "Merged. Everything is now on Anil Kumar." Open Anil Kumar: the lead, task and note are there, the phone is the second one, the email is filled in, and the second Anil is gone from Contacts.
5. **Both have a lead.** Give both a lead and press Merge: a red message says to close one lead first. Close one, merge again: works.
6. **Staff.** Sign in as staff: the pairs show, **Merge** does not, **Not the same** works.
7. **Companies.** Add "Infosys" and "Infosys Pvt Ltd" with a contact in the second; Companies → Possible duplicates → Merge: the contact is now in Infosys.
8. **Phone.** Repeat 4 at 375 px wide: the two records stack, no sideways scroll.

## Security checklist

- [x] Every route has a role (`staff`, `manager`) and works / 401 / 403 / 404 / 400 tests (`apps/api/test/duplicates.test.ts`); isolation entries for all three routes plus the list leak scan.
- [x] Table has `account_id`, RLS enabled and forced (`enable_tenant_rls`); the app role cannot delete suggestions; `UPDATE (contact_id)` grants are only used by each module's own move function.
- [x] Repository pattern: only `duplicates.repository.ts` touches `duplicate_suggestions`; every other table is moved by its own module, through its `index.ts`.
- [x] No personal data in the log or the event (ids and field names only).
- [x] Merge asks "Are you sure?" naming both; nothing is ever removed (the merged-away row stays).
- [x] Another business's id answers 404; the business comes from the session and the job's context only.

## Differences from the requirements

"Same email with different phone" becomes "same email name, other domain" (decision 1); merge is refused when both contacts have an open lead (decision 4).

## Build log

Migration 068; the pure matcher (12 tests, 10,000 contacts under 2 s); the six `move...ToContact` functions; `core.duplicates` (repository, service, 3 routes, nightly job); web page `DuplicatesPage` (+ links on Contacts and Companies, 4 state tests); 13 API tests, 3 isolation entries; 14 browser tests (phone and desktop, accessibility check).
