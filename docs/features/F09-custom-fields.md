# F09: Custom fields

**Requirements:** `2-crm-core/06-custom-fields.md`; `requirements/API.md` (Custom fields); docs/plan/PHASE-1.md (F09).
**Depends on:** F04 contacts, F05 companies, F06 leads.      **Module:** `core.fields` (core).
**Status:** `in_progress` under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

*(Written in full at the end of the last slice. Plan below.)*

## Reused from the hotel agent

Nothing that fits: the old project had fixed hotel fields. Designed from the requirement.

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md)

- **Seven field types:** Text, Number, Date, Dropdown (one choice), Yes/No, Phone, Email. One shared check (`validateCustomValues`, in `packages/shared`) is used by the API and the agent tools, so the two can never disagree.
- **The key is made from the label** ("Car model" gives `car_model`) and never changes, so renaming a label never loses values. A key is unique per object and never reused, even after the field is removed.
- **Values live in a `custom` jsonb column** of each object (contacts, companies, leads), keyed by the field's key. An empty value removes the key.
- **Removing a field archives it:** its saved values are kept but hidden for 30 days (then a nightly job deletes them for good), and the key stays taken.
- **"Required before Won"** is for leads only (the database refuses it on other objects); it is enforced when a lead is moved to a Won stage.
- **At most 50 live fields per object**, and at most 30 options in a dropdown.
- The contacts, companies and leads modules require `core.fields` and use `index.ts` (`findFieldDefinitions`, and the shared validation); the fields module requires nothing, so there is no cycle.

## Slice plan (at most 2 routes each)

1. `GET /fields?object=`, `POST /fields`: Settings → Fields (three tabs) with the list and the Add field form.
2. `PATCH /fields/{id}`, `DELETE /fields/{id}`: edit a field, remove (archive) it after "Are you sure?".
3. `POST /fields/reorder`, and custom values on contacts (add, edit, read; the contact form and page).
4. Custom values on companies and leads (forms, detail pages) and "Required before Won" on the lead move.
5. The AI asks the fields marked "AI should ask" (at most three per conversation) and saves them; the nightly purge of fields archived over 30 days.

## Slice log

**Slice 1 (built):** `GET /fields?object=` (any signed-in role) and `POST /fields` (managers). Migration `056_custom_fields.sql` (`field_definitions`: key made from the label, unique per business and object for ever; options as a JSON list; "required before Won" refused by the database off leads; at most 50 live fields per object). Module `core.fields`. `packages/shared/src/custom-fields.ts` holds the types, `makeFieldKey`, `tidyOptions` and the one check `validateCustomValues` (tested for every type). Web: Settings → Fields (managers only; tabs Contacts, Companies, Leads; Add field form). Also fixed the Settings tab row so many tabs scroll inside it instead of widening the page on a phone. Tests: `fields.test.ts`, shared `custom-fields.test.ts`, `fields-state.test.ts`, isolation entries, `e2e/fields.spec.ts` (7 at phone and desktop).

**Slice 2 (built):** `PATCH /fields/{id}` (managers; label, choices of a dropdown, "AI should ask", "required before Won" on leads; the key, type and object are refused with 400; at least one thing must be sent) and `DELETE /fields/{id}` (managers; archives: `archived_at` is set, the key stays taken, the place is freed; 204). Another business's field, an unknown one or an already removed one is 404. Activity log kinds `fields.updated` and `fields.deleted`, ids only. No migration (slice 1's column grants already allow it). Web: Change and Remove buttons on each field (Remove asks "Remove the field X?"); the Change form shows the type fixed. Tests: `fields.test.ts` (PATCH and DELETE), isolation entries, `fields-state.test.ts`, `e2e/fields.spec.ts` (change, remove).

**Slice 3 (built):** `POST /fields/reorder` (managers; `{object, ids}` must be exactly the object's live fields, once each, else 409 `FIELDS_CHANGED`; answers with the object's fields in the new order) and custom values on contacts: `POST /contacts` and `PATCH /contacts/{id}` take `custom` (`{key: answer}`; only the keys sent change, `null` or blank removes a key; every answer goes through the shared `validateCustomValues`, so a wrong answer or an unknown or removed key is 400 `INVALID_CUSTOM_VALUES` and nothing is saved). Every contact read shows `custom` for live fields only; answers of removed fields stay in the database, hidden. Migration `057_contacts_custom_values.sql` (`contacts.custom` jsonb). The contacts module now requires `core.fields` and reads definitions through its `index.ts` (`findFieldDefinitions`). Activity log lines still carry field names, never answers. Web: ↑ ↓ buttons on Settings → Fields; the Add and Edit contact panels show one box per field in its own kind (date picker, dropdown, Yes/No list...); the contact page lists the answers. Tests: `fields.test.ts` (reorder), `contacts-custom-values.test.ts`, isolation entry, `custom-answers.test.ts`, `e2e/fields.spec.ts` and `e2e/contact-custom-values.spec.ts`.
