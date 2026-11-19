---
name: f05-companies
description: F05 companies built and approved 18 Nov 2026 (4 slices, 6 routes); AI company via save_details; R74 gap: AI facts not yet on contact/lead/task
metadata:
  type: project
---

F05 (companies) done on branch `feature/F31-setup-wizard` under [[autonomous-slices-phase-one]]; brief `docs/features/F05-companies.md`.

**What exists:** module `core.companies`; routes `GET/POST /companies`, `GET/PATCH/DELETE /companies/{id}`, `PUT /contacts/{id}/company`; `GET /activities?company_id=`; `contacts.company_id` (contacts owns it); web Companies page, company page, Company box on the contact page (domain suggestion via `GET /companies?domain=`, free-mail list in `packages/shared`).

**Open gap (R74):** the AI saves details (name, interest, dates, budget, promise) only as facts in `conversation_facts`; only the company is applied (agents handler on the new event `conversation.outcomes_applied`, `services/agent-facts-applier.service.ts`). Writing name/interest/etc. onto contact/lead and the promise onto a task is still to do: one piece of work, extend that handler.

**Next:** F09 custom fields (5 routes: `/fields` GET/POST/PATCH/DELETE/reorder; `custom` jsonb on contacts, companies, leads; required-before-Won; AI asks), then F10, F11, F12, F13, F21-F30, F32-F36. Run e2e with `E2E_WEB_PORT=3917`.
