---
name: f07-notes-and-timeline
description: F07 timeline and notes status (17 Nov 2026): all 4 slices built and committed (slice 4 = b08600e), F08 tasks next; how to run checks, ports, Figma limits
metadata:
  type: project
---

**Where we are (17 Nov 2026):** Working autonomously under [[autonomous-slices-phase-one]] on branch `feature/F31-setup-wizard` (many local commits, NOT pushed or merged; latest F07 commit b08600e). F31 is marked approved (owner has not reviewed by hand). F07 is `in_progress` in `docs/plan/STATUS.md`; F07 and F08 were moved above F02 (R69). Brief with build log: `docs/features/F07-timeline-and-notes.md`.

**F07 built:** slice 1 `POST /notes`, `GET /activities` (+ migration 048, Notes panel from the designer's "Leads - Note" frame, Next activity is the FIRST column after the select box); slice 2 `PATCH/DELETE /notes/{id}` (writer edits own, manager soft-deletes); slice 3 `GET /activities/counts` (orange notes icon always visible when a lead has notes, add-note icon hover only) and notes on the contact page. Fix: Dialog/SidePanel now ignore a nested dialog's close event.
**Slice 4 (17 Nov 2026):** migration 049 (kinds lead_created/stage_changed, details, source_event_id); activities module subscribes to `lead.created`/`lead.moved` (payloads now carry contactId, stage names, createdBy/movedBy; lost reason deliberately NOT in events); chips All/Notes/Stage changes on lead page and contact page; Notes panel and counts are notes only. Feature guide added to the brief. Full API suite was 2398 green before slice 4; rerun after.
**Next:** mark F07 approved under the standing instruction after full suite + full e2e are green, then F08 tasks (the activity menu Create Task / Meeting / Call from Figma; Create Task first), then F02, F05, F09-F13, F21-F30, F32-F36.
**Known gaps:** a full-suite result after slice 3 may still be pending in `/tmp/claude-1000/.../scratchpad/test-run2.log` (rerun `npm run test` if the file is gone); full e2e not re-run after slice 3 (last full run 476 passed before slice 1 additions of later specs). Notes panel is full-height, not a floating card as in Figma; sort box has a visible label the Figma lacks.

**How to run things:** unit/API `npm run test` (about 5 min; run in background and monitor). Browser tests: `E2E_WEB_PORT=3917 npx playwright test` (the owner's other app uses port 3100, never touch it; if a run is interrupted, orphan vite on 3917 and widget server on 3200 must be killed, check they are yours first). Dev DB (Supabase) already has migrations up to 048; test DB too (`npm run db:migrate:test`). Always run `npx prettier --write` before commit (format:check is part of verify). Pretend API for browser tests is in `e2e/support.ts` plus `e2e/pretend-*.ts`.
**Figma:** file key uLzeTRYiei5PTnGqUoO4Ob; the MCP hit its seat call limit on 17 Nov 2026 (cannot read more until it resets). The owner sent node 81:725 which was not in the file data; frames I saw: Leads, Leads - Sidebar Minimised, Leads - Note (2024:3774), Leads Pipeline. Screenshots saved in docs/design/screens/.
