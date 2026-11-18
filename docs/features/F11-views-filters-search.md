# F11: Views, filters, search and lists

**Requirements:** `2-crm-core/08-views-filters-and-search.md`; `requirements/API.md` (Views, filters and search); docs/plan/PHASE-1.md (F11).
**Depends on:** F04 contacts, F05 companies, F06 leads, F09 custom fields.      **Modules:** `core.search` (search), later `core.views` (views and lists).
**Status:** `in_progress` under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally. Branch `feature/F11-views-filters-search`, cut from `dev`.

## Feature guide

*(Written in full at the end of the last slice. Plan below.)*

## Reused from the hotel agent

Nothing that fits: the old project had no saved views. The phone-number matching (`readSearchText` in the contacts module, built in F04) is reused as it is.

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md)

- **Search finds three things:** contacts (name, email, phone), companies (name, website, city) and leads (through the person they are about). At most 5 of each, so the box answers at once. The "own leads only" role finds only its own leads (as everywhere); contacts and companies are open to every role, as they are on their own pages.
- **Phone numbers match however they are typed** (`+91 98470`, spaces, a leading 0): the same rule the contacts list already uses (at least 3 digits).
- **The search module only asks the other modules through their `index.ts`;** it owns no table.
- **Speed:** measured before any index is added (the plan's test is 50,000 contacts under 1 second).

## Slice plan (at most 2 routes each)

1. `GET /search?q=`: the top-bar search box (it was drawn disabled) opens a results sheet grouped by Contacts, Companies and Leads.
2. `GET /views?object=`, `POST /views`: saved views of the Leads list (filters, sort, columns) with Save view and view tabs.
3. `PATCH /views/{id}`, `DELETE /views/{id}`: rename, share with the team (managers share), delete after "Are you sure?".
4. The filter engine: the same filters on contacts, companies, leads and tasks, including custom fields and temperature (no new routes; the lists take the filters).
5. `GET /lists`, `POST /lists`: static contact lists, made from a view or by hand.
6. `POST /lists/{id}/members`, `DELETE /lists/{id}/members/{contact_id}`.
7. `DELETE /lists/{id}`.

## Slice log

**Slice 1 (built):** `GET /search?q=` (any signed-in role; `q` is 2 to 100 characters, else 400). New module `core.search` (no table of its own; it asks the contacts, companies and leads modules through their `index.ts`). Finds people by name, email or phone (any way the number is typed, three digits or more), companies by name, website or city, and leads through the person they are about; at most 5 of each. The "own leads only" role finds only its own leads; people and companies are open to every role. No migration, no activity log (a search changes nothing). Web: the top-bar search box, which was drawn switched off, now works: results appear a moment after typing stops, grouped as Contacts, Companies and Leads, each a link; it says when to keep typing, when it is searching, when nothing matches and when the search failed; Escape or a click outside closes it. On a phone a search button in the top bar opens the box in a row under the bar. The top bar now sits above the sticky table headings (z-20), so its results are never covered. Tests: `search.test.ts` (8), isolation entry, `e2e/search.spec.ts` (phone and desktop, including accessibility).
