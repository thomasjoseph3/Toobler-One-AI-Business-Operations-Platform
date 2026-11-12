# core.leads: the pipeline and the leads board

Built in slices of at most 2 API routes (see `docs/features/F06-pipeline-and-leads.md`).

| Folder | What is in it |
| --- | --- |
| `routes/` | `leads.routes.ts` (`POST /leads`, `GET /leads`, `GET /leads/{id}`, `PATCH /leads/{id}`); `lost-reasons.routes.ts` (`GET /lost-reasons`, `PUT /lost-reasons`); `pipeline.routes.ts` (`GET /pipeline`, `POST /pipeline/stages`, `PATCH /pipeline/stages/{id}`, `POST /pipeline/stages/reorder`, `DELETE /pipeline/stages/{id}`) |
| `services/` | `leads.service.ts` (add a lead by hand, list and board, read one, change details); `lost-reasons.service.ts` (the Lost dialog's list); `pipeline.service.ts` (the stage rules, activity log, events) and `default-setup.service.ts` (what a new business starts with) |
| `repositories/` | `pipeline.repository.ts`, `lost-reasons.repository.ts`, `assignment-rules.repository.ts`, `leads.repository.ts`: the SQL for those tables |
| `helpers/` | `default-pipeline.ts`: the starting stages, lost reasons and limits (pure data); `open-lead-rule.ts`: rule R6, what a new enquiry does when the person already has a lead (pure) |

A business has one pipeline: open stages, then Won, then Lost. Won and Lost always exist exactly once and are always last.
