# F05: Companies

**Requirements:** `2-crm-core/02-companies.md`; `requirements/API.md` (Companies); docs/plan/PHASE-1.md (F05).
**Depends on:** F04 contacts, F06 leads, F07 timeline.      **Module:** `core.companies` (core).
**Status:** `in_progress` under the standing instruction (17 Nov 2026): built in slices of at most 2 routes, each tested and committed locally.

## Feature guide

*(Written in full at the end of the last slice. Plan below.)*

## Reused from the hotel agent

Nothing: the old project has no companies. Designed from the requirement.

## Decisions (to be recorded in docs/REQUIREMENTS-REVIEW.md)

- **A contact belongs to at most one company** (`contacts.company_id`, owned by the contacts module). The companies module links and unlinks through the contacts module's `index.ts`, never by touching the table itself.
- **Matching ignores capital letters and spaces:** `name_key` is the name lower-cased with all spaces removed ("Infosys HR" = "infosys hr" = "InfosysHR"). Two live companies of one business never share a `name_key`.
- **Domain suggestion without a new route:** a company may have a work `domain` (`infosys.com`). Free-mail domains (gmail.com, yahoo.com, outlook.com and the like, one list in `packages/shared`) can never be a company's domain. The contact page, when the contact has a work email and no company, asks `GET /companies?domain=` and offers the match.
- **Delete keeps the contacts:** a soft delete (`deleted_at`) that also clears `company_id` on its contacts. The name can be used again afterwards.
- **Company list numbers** (contacts, open leads, won value) are worked out in code from the contacts and leads, never typed in. Won value is the sum of the budget of its people's won leads, in paise.
- **Custom fields** on a company arrive with F09 (the `custom` column is added then). **Combined timeline:** `GET /activities?company_id=` is added to the existing timeline route (slice 4). **The AI:** `save_lead` accepts `company_name` (slice 4).

## Slice plan (at most 2 routes each)

1. `POST /companies`, `GET /companies`: Companies list and Add company form.
2. `GET /companies/{id}`, `PUT /contacts/{id}/company`: the company page and the Company box on the contact page (with the domain suggestion).
3. `PATCH /companies/{id}`, `DELETE /companies/{id}`: edit, and delete after "Are you sure?" (keeps the contacts).
4. The company's combined timeline (`GET /activities?company_id=`) and the AI saving a company name (`save_lead.company_name`); no new routes.

## Slice log

**Slice 1 (built):** `POST /companies` and `GET /companies` (any signed-in role). Migration `055_companies.sql`: table `companies` (`name_key` is generated from the name, so "Infosys HR" = "infosys hr" = "InfosysHR"; a live name and a live work domain are each unique per business; soft delete) and `contacts.company_id` with a composite key so a contact and its company share a business. Module `core.companies` (requires auth, contacts, leads): `routes/companies.routes.ts`, `services/companies.service.ts` (the numbers about a company's people are worked out here from the contacts and leads modules' `index.ts`: `findContactCompanyLinks`, `findLeadTotalsForContacts`), `repositories/companies.repository.ts`, `helpers/company-name.ts`. `packages/shared/src/companies.ts` holds the one free-mail list (`FREE_MAIL_DOMAINS`), `normaliseDomain` (turns "https://www.Infosys.com/careers" into "infosys.com") and the schemas. A contact now carries `companyId`. Web: the Companies page (`features/companies/`: list as table or cards, search in the web address, Add company form with a pasted web address). Tests: `companies.test.ts` (15), `company-name.test.ts`, isolation entries, `companies-state.test.ts`, `e2e/companies.spec.ts` (10 at phone and desktop).
