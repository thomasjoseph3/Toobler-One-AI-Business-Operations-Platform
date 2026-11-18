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

**Slice 1, speed (measured):** with 50,000 contacts in the test database (`search-speed.test.ts`), a search answers in 177 ms (a rare name), 51 ms (a phone number typed with a space), 160 ms (an email start) and 55 ms (a common word), all under the 1 second the requirement asks for. So no search index is added: nothing shows it is needed (measure before optimising). Re-check if a business passes 50,000 contacts.

**Slice 2 (built):** `GET /views?object=lead` (any signed-in role; `object` is required and only `lead` exists so far, else 400) and `POST /views` (any signed-in role; body `{object, name, filters, sort, layout}`; the name is trimmed, 1 to 60 characters; the view is the person's own and not shared; the owner and the business come from the session, never the body; anything extra in the body is 400). A view keeps the Leads list's own filter words: `status` (open or closed), `stageId` and `owner: "me"` (so a shared view later means "my leads" to each person), plus the sort and the layout (table or pipeline board). A person never has two views with the same name, whatever the capitals (409 `VIEW_NAME_TAKEN`) and at most 30 per list (409 `TOO_MANY_VIEWS`). Migration `063_saved_views.sql` (`saved_views`, RLS, update limited to the editable columns, delete allowed). New module `core.views` (requires nothing). Activity log kind `views.created` (field names only, never the view's name). Web: a **Save view** button in the Leads toolbar opens a box to name it; saved views show as tabs above the toolbar ("All leads" first); a tab opens the list with its filters and sort and is marked when the list on screen matches it, and changing the filters turns it off. Tests: `views.test.ts` (9), isolation entries, `saved-views.test.ts` (6), `e2e/saved-views.spec.ts` (phone and desktop, including accessibility).

**Slice 3 (built):** `PATCH /views/{id}` (any signed-in role; body: any of `name`, `shared`, `filters`, `sort` (null clears it), `layout`; nothing sent is 400 `NOTHING_TO_CHANGE`; extra words are 400; a name already used by the owner is 409 `VIEW_NAME_TAKEN`) and `DELETE /views/{id}` (204). Who may do what: the owner changes and deletes their own views; **only a manager can set `shared`** (403 for anyone else); a manager can also stop sharing or delete a shared view of anyone, but not change what it shows (403, that is its owner's). A colleague's unshared view does not exist for the person (404); a shared view they may not change is 403. Sending what the view already has changes nothing and writes no log line. Deleting is for good (a view is only a saved set of words). Activity log kinds `views.updated` and `views.deleted` (field names only, never the view's name). No migration. Web: when the list shows a saved view, a row under the tabs names it with **Rename**, **Share with the team** or **Stop sharing** (managers) and **Delete view** (an "Are you sure?" that names the view); a shared view's tab carries the words "Shared with the team"; a colleague's shared view shows no buttons to someone who may not change it. Tests: `views.test.ts` (16 in all), isolation entries (PATCH and DELETE), `e2e/saved-views.spec.ts` (20 across phone and desktop).

**Journey tests (added after slice 3):** `f09-f11-journeys.test.ts` tells three whole stories route after route, with real people and their own sessions: the life of a custom field (add, fill in on a contact and lead, Won refused until the required field is filled, reorder, remove, hidden, purged after 30 days), a lead scored by what the customer said (hot with a reason, a person overrides it, the next conversation scores it again), and finding things and saving views (search by phone and name, the "own leads only" colleague, a view saved, shared, renamed, deleted).
