# F05: Companies

**Requirements:** `2-crm-core/02-companies.md`; `requirements/API.md` (Companies); docs/plan/PHASE-1.md (F05).
**Depends on:** F04 contacts, F06 leads, F07 timeline.      **Module:** `core.companies` (core).
**Status:** `in_progress` under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

**What it does.** A company is a firm, school, family or group that your contacts belong to. Rahul and Meera both work for "Infosys HR", which books trips for many staff. The company page shows both of them, every lead from either of them, the total that was won, and one timeline that puts all their notes and news together. A contact belongs to at most one company; the Company box on a contact's page shows it, lets you change it or take the person out, and offers the right company when their work email matches (never for gmail.com and the like).

**Why it is useful.** Many enquiries come from someone acting for a group. Without companies you cannot see that five enquiries this year came from the same firm, or what that firm is worth to you.

**A day in the life.** Rahul calls and says he is booking for Infosys HR. The AI notes "Infosys HR" and, when the call is sorted, Rahul's contact is put in that company (it is made if it did not exist). Next month Meera from Infosys HR writes from her work email: on her contact page the Company box says "Their email ends in infosys.com, which is Infosys HR" and one press links her. On the Infosys HR page Anita sees both people, their leads, ₹1,50,000 won, and one timeline of everything said to either of them.

**Who can do what.**

| | Manager | Staff | Staff (own leads only) |
| --- | --- | --- | --- |
| See the list and a company page | Yes | Yes | Yes, but only their own leads and the numbers of only those |
| Add or change a company, put a contact in one or take it out | Yes | Yes | Yes |
| Delete a company | Yes | No | No |
| See a company's combined timeline | Yes | Yes | No (it would show other people's leads) |

**Settings and limits.** Two companies of one business never share a name once capital letters and spaces are ignored ("Infosys HR" = "infosys hr" = "InfosysHR"), and never share a website domain. A free email service (gmail.com, yahoo.com, outlook.com…) can never be a company's domain. A company name is at most 120 characters. The company is looked after by the person who added it, unless another is chosen.

**What it never does.** Deleting a company never deletes its people: they just lose the link, and the name and website can be used again. The numbers (contacts, open leads, won value) are always worked out from the records, never typed in. What the AI hears never overrides a company staff chose for a contact. The activity log and events carry ids and field names, never the company's words.

**Not part of it.** Extra fields on a company (F09 custom fields). Researching a company from the web (Phase 7). Importing and exporting companies (F12). Finding duplicate companies (F13).

### For the tech team

- **Module:** `core.companies` (requires auth, contacts, leads). The contacts module owns `contacts.company_id` and the link functions; the companies module reaches them only through contacts' `index.ts`. Activities requires companies (the combined timeline); agents requires companies and contacts (a company the AI heard).
- **Tables:** `companies` (055: `name_key` generated from the name, unique per business among live companies; a live `domain` is unique per business; soft delete; owner a person of the business) and `contacts.company_id` (composite key: a contact and its company share a business).
- **Routes (all under `/api/v1`):** `GET /companies`, `POST /companies`, `GET /companies/{id}`, `PATCH /companies/{id}` (any signed-in role), `DELETE /companies/{id}` (managers), `PUT /contacts/{id}/company` (any signed-in role; `{"companyId": null}` takes the contact out). `GET /activities?company_id=` is the existing timeline route with a third filter.
- **Events:** published `contact.company_changed` (`contactId`, `fromCompanyId`, `toCompanyId`, `by`), `company.deleted` (`companyId`, `by`). Listens: `team.member_removed` (companies the removed person looked after move to the person chosen); the agents module listens to `conversation.outcomes_applied` (new, published by the conversations module after a conversation's contact and lead are made; ids only).
- **How it works.** Worked-out numbers: the companies service asks contacts for the company's people and leads for their totals (`findLeadTotalsForContacts`, which takes the "own leads only" person so counts never include others' leads). The domain suggestion needs no route: the contact page asks `GET /companies?domain=` using the same free-mail list (`packages/shared`). Deleting a company clears the link on its contacts first, then soft-deletes it, in one transaction. The AI: `save_details` now takes `company`; once the conversation's contact exists the agents handler finds or makes the company by name key and puts the contact in it only if the contact has none.
- **Known limits.** The AI's other details (name, what they want, dates, budget) and its promise are still only stored as facts: putting them on the contact, the lead and a task is a separate piece (R74). A company's own custom fields wait for F09.

## Reused from the hotel agent

Nothing: the old project has no companies. Designed from the requirement.

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md)

- **A contact belongs to at most one company** (`contacts.company_id`, owned by the contacts module). The companies module links and unlinks through the contacts module's `index.ts`, never by touching the table itself.
- **Matching ignores capital letters and spaces:** `name_key` is the name lower-cased with all spaces removed ("Infosys HR" = "infosys hr" = "InfosysHR"). Two live companies of one business never share a `name_key`.
- **Domain suggestion without a new route:** a company may have a work `domain` (`infosys.com`). Free-mail domains (gmail.com, yahoo.com, outlook.com and the like, one list in `packages/shared`) can never be a company's domain. The contact page, when the contact has a work email and no company, asks `GET /companies?domain=` and offers the match.
- **Delete keeps the contacts:** a soft delete (`deleted_at`) that also clears `company_id` on its contacts. The name can be used again afterwards.
- **Company list numbers** (contacts, open leads, won value) are worked out in code from the contacts and leads, never typed in. Won value is the sum of the budget of its people's won leads, in paise.
- **Custom fields** on a company arrive with F09 (the `custom` column is added then). **Combined timeline:** `GET /activities?company_id=` is added to the existing timeline route (slice 4). **The AI:** the tool is `save_details` here (not `save_lead`): it takes `company` (slice 4).

## Slice plan (at most 2 routes each)

1. `POST /companies`, `GET /companies`: Companies list and Add company form.
2. `GET /companies/{id}`, `PUT /contacts/{id}/company`: the company page and the Company box on the contact page (with the domain suggestion).
3. `PATCH /companies/{id}`, `DELETE /companies/{id}`: edit, and delete after "Are you sure?" (keeps the contacts).
4. The company's combined timeline (`GET /activities?company_id=`) and the AI saving a company name (`save_details.company`); no new routes.

## Slice log

**Slice 1 (built):** `POST /companies` and `GET /companies` (any signed-in role). Migration `055_companies.sql`: table `companies` (`name_key` is generated from the name, so "Infosys HR" = "infosys hr" = "InfosysHR"; a live name and a live work domain are each unique per business; soft delete) and `contacts.company_id` with a composite key so a contact and its company share a business. Module `core.companies` (requires auth, contacts, leads): `routes/companies.routes.ts`, `services/companies.service.ts` (the numbers about a company's people are worked out here from the contacts and leads modules' `index.ts`: `findContactCompanyLinks`, `findLeadTotalsForContacts`), `repositories/companies.repository.ts`, `helpers/company-name.ts`. `packages/shared/src/companies.ts` holds the one free-mail list (`FREE_MAIL_DOMAINS`), `normaliseDomain` (turns "https://www.Infosys.com/careers" into "infosys.com") and the schemas. A contact now carries `companyId`. Web: the Companies page (`features/companies/`: list as table or cards, search in the web address, Add company form with a pasted web address). Tests: `companies.test.ts` (15), `company-name.test.ts`, isolation entries, `companies-state.test.ts`, `e2e/companies.spec.ts` (10 at phone and desktop).

**Slice 2 (built):** `GET /companies/{id}` (the company with its numbers, its people and their leads; the "own leads only" role sees and counts only the leads it owns) and `PUT /contacts/{id}/company` (`{ "companyId": null }` takes a contact out; moving to another company leaves the first). The contacts module owns the link: it gained `findContactsOfCompany`, `setContactCompany` and `clearCompanyOfContacts` in its `index.ts`; leads gained `findLeadsOfContacts` and the `visibleToUserId` option on `findLeadTotalsForContacts`. Writes the log line `contacts.company_changed` and publishes `contact.company_changed` (ids only) only when something changed. Web: the company page (`/companies/{id}`: details, numbers, people with Take out and Add a person, leads with their stage word and budget), company names in the list link to it, and the Company box on the contact page (the company with Change and Take out; or a search, plus the offer of the company whose website domain matches the contact's work email: never for gmail.com and the like). Tests: `companies-detail.test.ts` (9), isolation entries, `company-suggestion.test.ts`, `e2e/company-page.spec.ts` (12 at phone and desktop).

**Slice 3 (built):** `PATCH /companies/{id}` (any signed-in role; only the fields sent change; `null` clears the domain, phone, city or owner; the same name, domain, phone and owner rules as adding; keeping its own name is fine) and `DELETE /companies/{id}` (managers only; soft; its people lose the link and stay; the name and website can be used again). Writes `companies.updated` (field names, only when something changed) and `companies.deleted`; publishes `company.deleted` (ids only). The companies module also listens to `team.member_removed`: the companies a removed person looked after go to the person the manager chose. Web: Edit and Delete (managers) on the company page (the same form as Add, sending only what changed; Delete asks "Delete Infosys HR?" first and the list says it was deleted). Tests: `companies-change.test.ts` (13), isolation entries, 3 more unit tests, 5 more e2e specs at phone and desktop.

**Slice 4 (built):** the company's combined timeline and the AI's company, no new routes. `GET /activities?company_id=` (exactly one of `lead_id`, `contact_id`, `company_id`; 404 for another business's company; 403 for the "own leads only" role) lists the activities of the company's people (the repository takes a list of contact ids). The conversations module now publishes `conversation.outcomes_applied` (ids only) once a sorted conversation's contact and lead or ticket are made; the agents module handles it (`services/agent-facts-applier.service.ts`): the `Company` detail the AI saved with `save_details` becomes a company (found by name key or made, `findOrCreateCompanyByName` in companies' `index.ts`) and the contact is put in it only if it has none (`setContactCompanyIfNone`), stamped as the agent. Web: a Timeline card on the company page (the same chips and lines as a lead's, read only; hidden from the "own leads only" role). Tests: `companies-timeline.test.ts` (7), `agent-company.test.ts` (6), e2e (2 more specs).

## Status

All four slices built and tested. Marked `approved` under the owner's standing instruction (17 Nov 2026) once `npm run verify` passed; the owner has not tested it by hand yet.
