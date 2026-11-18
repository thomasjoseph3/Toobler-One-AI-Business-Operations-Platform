# F09: Custom fields

**Requirements:** `2-crm-core/06-custom-fields.md`; `requirements/API.md` (Custom fields); docs/plan/PHASE-1.md (F09).
**Depends on:** F04 contacts, F05 companies, F06 leads.      **Module:** `core.fields` (core).
**Status:** `approved` (18 Nov 2026, verify green; was `in_progress`) under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

**What it does.** Every business is different. A wedding planner wants to remember a "Wedding date" and a "Guest count"; a car dealer wants a "Car model". Custom fields let a manager add their own boxes to contacts, companies and leads, in Settings → Fields, in seven kinds: text, number, date, dropdown (one choice), yes/no, phone and email.

**Why it is useful.** The business keeps what matters to it in the same place as everything else, instead of in a notebook or a spreadsheet. The AI can ask the customer for it in the chat, so it is already filled in when your team opens the lead.

**A day in the life.** Meera runs a wedding venue. She adds a lead field "Guest count" and ticks "AI should ask". That evening a visitor chats with the website assistant; after giving a name and phone number they are asked, once, roughly how many guests. The answer, 120, is on their lead the next morning. When Meera's team marks the lead Won, the system refuses until "Venue deposit" (marked "Required before Won") is filled in.

**Who can do what.** Managers add, change, reorder and remove fields. Everyone who can see a contact, company or lead can read and fill in its answers (staff on "own leads only" only for their own leads).

**Settings and limits.** Up to 50 fields per kind of record and 30 choices in a dropdown. The AI asks at most three questions in one conversation, only from contact and lead fields, and never pushes. A field's type and internal key cannot change after it is made (renaming the label is fine). Removing a field hides it at once; its saved answers are kept for 30 days, then deleted for good by a nightly job.

**What it never does.** The AI never overrides an answer your team typed, never asks about companies, and never saves an answer that does not fit the field (a date that is not a date, a choice that is not on the list). The activity log records which fields changed, never the answers.

**Not part of it.** Fields on tickets or tasks, calculated fields, and showing custom fields as columns in the leads board or in exports are not built.

### For the tech team

Module `core.fields` (requires nothing; contacts, companies, leads and agents require it). Table `field_definitions` (migrations 056, 059); `custom` jsonb on contacts, companies, leads (057, 058); `conversation_facts.custom_answers` (060). Routes: `GET/POST /fields`, `PATCH/DELETE /fields/{id}`, `POST /fields/reorder`; answers travel in the `custom` property of the existing contact, company and lead routes. One shared check, `validateCustomValues` in `packages/shared`, used by the API and the AI tool. Jobs: `fields.purge_removed` (nightly, queues one per business) and `fields.purge_removed_for_business`. Events: publishes `field.values_purged`; listens (contacts, companies, leads) to delete the answer; the agents module listens to `conversation.outcomes_applied` to add the AI's answers. Known limits: the AI asks only the first three marked fields; answers go to the conversation's first lead; company fields are not asked (R75).

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

**Slice 4 (built):** custom values on companies and leads, and "Required before Won". `POST` and `PATCH /companies` and `POST` and `PATCH /leads` take `custom` (the same rules as contacts: checked by the shared check, only the keys sent change, `null` removes one, 400 `INVALID_CUSTOM_VALUES` on a wrong answer or an unknown or removed key). Every company and lead read shows `custom` for live fields only. `POST /leads/{id}/move` to a Won stage is refused with 400 `REQUIRED_FIELDS_MISSING` ("Fill in Colour before marking this lead Won.") while a live lead field marked "Required before Won" has no answer. Migration `058_companies_and_leads_custom_values.sql`. The checking, merging and hiding now live once in the fields module (`custom-answers.service.ts`, used through its `index.ts`) for all three objects; the companies and leads modules require `core.fields`. Web: the company form and page, the lead form, and the lead details card show and edit the custom fields; a refused move to Won says which fields to fill in. Tests: `custom-values-companies-leads.test.ts`.

**Slice 5 (built):** no new routes. (1) **The AI asks the business's own questions.** Fields marked "AI should ask" on contacts and leads (at most three in all, contact fields first, in the business's order; company fields are never asked) are listed in the agent's prompt ("ALSO ASK") with the kind of answer each takes. A new tool `save_custom_answers` (only given to the model when the business has such fields) takes the field name and the customer's words; the same shared `validateCustomValues` check the API uses decides whether it fits, and a bad answer sends the model back to ask again. Answers wait in the conversation's facts (migration `060_conversation_facts_custom_answers.sql`, `custom_answers`, keyed `contact.car_model`). When the conversation's contact and lead are made (`conversation.outcomes_applied`), they are added to the contact and the first lead, only for fields with no answer yet (staff's answers are never overridden; one SQL statement, so safe to run twice); a field removed in between is skipped; the activity log gets `contacts.custom_answers_added` / `leads.custom_answers_added` with field names only. The agents module now requires `core.leads` and `core.fields`. (2) **The nightly purge.** Job `fields.purge_removed` (03:30 every night) queues `fields.purge_removed_for_business` per business: fields removed over 30 days ago announce `field.values_purged` (object and key) and are marked `values_purged_at` (migration `059_fields_values_purged.sql`); the contacts, companies and leads modules each delete that answer from their own records. The field row stays, so its key is never reused. Tests: `test/agent-custom-answers.test.ts`, `choose-fields-to-ask.test.ts`, `agent-custom-answers.test.ts`, `build-agent-prompt.test.ts`.

