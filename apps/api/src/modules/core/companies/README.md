# core.companies: companies

Built in slices of at most 2 API routes (see `docs/features/F05-companies.md`).

| Folder          | What is in it                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`       | `companies.routes.ts`: `POST /companies`, `GET /companies`                                                                            |
| `services/`     | `companies.service.ts`: add and list companies, with the numbers about their people (contacts, open leads, won value) worked out here |
| `repositories/` | `companies.repository.ts`: the SQL for `companies`                                                                                    |
| `helpers/`      | `company-name.ts`: the name without capitals and spaces, which is how two companies are told to be the same (pure)                    |

A company is a firm, school, family or group that contacts belong to. A contact belongs to at most one company (`contacts.company_id`, which the
contacts module owns). Two live companies never share a name once capitals and spaces are ignored, and never share a work domain. A free-mail
domain (gmail.com and the like, one list in `packages/shared`) can never be a company's domain.

Reads contacts, leads and people only through those modules' `index.ts` (`findContactCompanyLinks`, `findLeadTotalsForContacts`, `findPeopleSummaries`).
