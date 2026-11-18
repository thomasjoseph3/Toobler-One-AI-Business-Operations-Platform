---
name: f13-duplicates-and-merging
description: "F13 duplicates and merging done and approved 18 Nov 2026 (branch feature/F13-duplicates-and-merging); what was built, decisions R79, how to try it"
metadata:
  node_type: memory
  type: project
  originSessionId: 845cf9cd-ed33-45e4-93da-ebe2843594b6
  modified: 2026-11-18T10:48:22.814Z
---

F13 approved 18 Nov 2026 under the standing instruction (verify green: 2948 unit/API, 766 e2e). Commits 99573b1 (backend) and 85906b0 (screen, tests, guide). Next feature: F21 Inbox, staff takeover and live updates (owner said "move on to the next feature").

- Module `core.duplicates`; migration 068 (`duplicate_suggestions`, `merged_into_id` on contacts/companies, `UPDATE (contact_id)` grants on leads/tasks/tickets/activities). Each owning module has its own `move...ToContact` through its index.ts.
- Routes: GET /duplicates?object=, POST /duplicates/{id}/merge (manager), POST /duplicates/{id}/dismiss (staff). Nightly job 02:30; `npm run duplicates:detect -- --email <manager>` runs it now.
- Decisions R79 in REQUIREMENTS-REVIEW.md. Owner chose: merge is REFUSED (409 BOTH_HAVE_OPEN_LEADS) when both contacts have an open lead.

**Why:** requirement said "same email with different phone", impossible because of unique indexes, so it became "same email name, other domain".
**How to apply:** when touching contacts/companies, remember merged-away rows stay as deleted rows with merged_into_id.
