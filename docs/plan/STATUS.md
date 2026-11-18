# Feature status

The single source of truth for what is being built. Rules ([DEVELOPMENT.md](../DEVELOPMENT.md)): at most one feature is
`in_progress` or `in_review`; a feature starts only when every feature above it is `approved` or `deferred`.
`npm run gate` reads this table: keep its columns and status words exactly.

Statuses: `planned`, `in_progress`, `in_review`, `approved`, `deferred`.

**Note (17 Nov 2026):** from F31 on, the owner told Claude to go on without waiting for approval, so a feature may show `approved` here when Claude marked it under that standing instruction after `npm run verify` passed; the owner has not necessarily tested it by hand. Each brief says so.

**Build order (changed 10 Nov 2026, see R28):** the rows are in build order, not number order. The first working lead
engine comes first (the rows from F01 down to F31), then the rest of the CRM core, the workspace and the other
channels. Feature numbers stay as they were, so the briefs and links do not change.

| ID | Feature | Status | Brief | Approved on |
| --- | --- | --- | --- | --- |
| F00 | Foundation and design system | approved | [brief](../features/F00-foundation.md) | 2026-11-10 |
| F01 | Sign-up, sign-in and sessions | approved | [brief](../features/F01-sign-up-and-sign-in.md) | 2026-11-11 |
| F03 | Modules: plug and play | approved | [brief](../features/F03-modules.md) | 2026-11-11 |
| F04 | Contacts | approved | [brief](../features/F04-contacts.md) | 2026-11-11 |
| F06 | Pipeline and leads board | approved | [brief](../features/F06-pipeline-and-leads.md) | 2026-11-12 |
| F14 | Tickets | approved | [brief](../features/F14-tickets.md) | 2026-11-12 |
| F16 | Business profile, business questions and situations | approved | [brief](../features/F16-business-profile.md) | 2026-11-12 |
| F17 | Offerings and offers | approved | [brief](../features/F17-offerings-and-offers.md) | 2026-11-13 |
| F18 | Documents, FAQs, knowledge search and unanswered questions | approved | [brief](../features/F18-faqs-and-unanswered-questions.md) | 2026-11-13 |
| F37 | AI models and keys (built before F15) | approved | [brief](../features/F37-ai-models-and-keys.md) | 2026-11-13 |
| F15 | Conversation types and the router | approved | [brief](../features/F15-conversation-types-and-router.md) | 2026-11-16 |
| F19 | The AI agent (text) and Test the agent | approved | [brief](../features/F19-ai-agent-and-test-the-agent.md) | 2026-11-16 |
| F20 | Website chat | approved | [brief](../features/F20-website-chat.md) | 2026-11-16 |
| F31 | Setup wizard and fill from website | approved | [brief](../features/F31-setup-wizard.md) | 2026-11-17 |
| F07 | Timeline and notes | approved | [brief](../features/F07-timeline-and-notes.md) | 2026-11-17 |
| F08 | Tasks and reminders | approved | [brief](../features/F08-tasks-and-reminders.md) | 2026-11-17 |
| F02 | Team, roles, teams and the activity log | approved | [brief](../features/F02-team-and-roles.md) | 2026-11-18 |
| F05 | Companies | approved | [brief](../features/F05-companies.md) | 2026-11-18 |
| F09 | Custom fields | in_progress | [brief](../features/F09-custom-fields.md) | |
| F10 | Lead scoring and the Filtered tab | planned | | |
| F11 | Views, filters, search and lists | planned | | |
| F12 | Import and export | planned | | |
| F13 | Duplicates and merging | planned | | |
| F21 | Inbox, staff takeover and live updates | planned | | |
| F22 | Today page | planned | | |
| F23 | Staff alerts and the morning summary | planned | | |
| F24 | Privacy and support access | planned | | |
| F25 | WhatsApp | planned | | |
| F26 | Email | planned | | |
| F27 | Follow-ups | planned | | |
| F28 | Reports | planned | | |
| F29 | Phone calls (voice) | planned | | |
| F30 | Staff assistant and MCP | planned | | |
| F32 | Free "what you're missing" check | planned | | |
| F33 | Competitor report | planned | | |
| F34 | Subscription billing | planned | | |
| F35 | Platform console | planned | | |
| F36 | Go live | planned | | |

## Deferred work (not in the table, so the gate ignores it)

| Work | Why it waits | Where it is |
| --- | --- | --- |
| **F06-UI: the leads screens** (board with drag on computer and Move on phone, list, lead page, Settings → Pipeline) | The designer is making the screens. The owner approved the F06 **backend** on 2026-11-12 (14 routes, tested) and parked the screens. | Planned in the F06 brief ("Screens"). The Postman collection *Toobler One - F06 leads and pipeline* tests the API meanwhile. |
| **F14-UI: the ticket screens** (Tickets list and page, the open tickets on the contact page) | The designer is making the screens. The owner approved the F14 **backend** on 2026-11-12 (4 routes, tested) and parked the screens. | Planned in the F14 brief ("Screens"). The Postman collection *Toobler One - F14 tickets (run in order)* tests the API meanwhile. |
| **F16-UI: the business profile screens** (Knowledge base → Business profile with sections A to H and the completeness card, Situations, Settings → time zone and country) | The designer is making the screens. The owner approved the F16 **backend** on 2026-11-12 (7 routes, tested) and parked the screens. | Planned in the F16 brief. The Postman collection *Toobler One - F16 business profile (run in order)* tests the API meanwhile. |
| **F01-UI: the auth screens** (sign-in, sign-up, verify email, forgot and reset password, profile, full-stack browser tests) | The designer is making the screens. The owner approved the F01 **backend** on 2026-11-11 (8 slices, all tested by the owner) and parked the screens. | UI slice 1 (sign-in, sign-out, the guard, the API client) is built on the local branch `feature/F01-ui-sign-in`, commit `0d78997`. It works, and the designer's look goes on top. UI slices 2 to 6 are planned in the F01 brief. |
| **F03-UI: the module screens** (Settings → Modules, the menu built from `/me`, the platform page) | The designer is making the screens; the owner put the front end on hold (11 Nov 2026). The F03 backend is built and tested. | Planned in the F03 brief. |
| **F18-Documents: uploads, file reading, "Use this / Don't use", "These don't match", Re-read website** | Owner decision 13 Nov 2026: too messy for now (files, storage, reading PDF/Word/photos, cost, security). F18 is built with FAQs, unanswered questions and search only. | Decide at the end of Phase 1 whether to build it (R47). Planned design: storage behind an interface (Supabase Storage), vetted PDF/Word libraries, AI image reading for photos. |
| **API docs (Swagger / OpenAPI)** | The routes already describe their shapes with zod, so a docs page can be generated. It is a small feature of its own, planned right after F03 is approved (owner agreed 2026-11-11). Packages to be vetted first; served in development only. | Built and merged (`/docs`, development only); brief: [API-docs-swagger.md](../features/API-docs-swagger.md). |

When the designer's screens arrive, the F01-UI work is done as slices (one screen at a time, owner testing each), and it is approved separately.

## UI catch-up block (owner decision 17 Nov 2026, R64)

Before more backend features, the missing staff screens are built (existing routes only, no new routes), one screen per slice, the owner testing each. After the block, every new feature is built backend and screens together. F31 pauses after slice 4; its setup chat (slice 5) comes when the block reaches the setup wizard. Same design system v1.3, same pieces (`packages/ui`, `t()`, `useApiResource`); screens the designer has not drawn are designed by us and flagged in `docs/FRONTEND.md` section 5.

| UI slice | Screen | Uses | Status |
| --- | --- | --- | --- |
| C1 | **Business profile** (Knowledge base → Business profile: sections A to H as a form, "From your website, please check" with Yes / Change, completeness card, time zone, country and callback promise) | F16 routes, `/knowledge/prefill` | built, waiting for the owner's check ([notes](../features/C1-business-profile.md)) |
| C2 | **Setup page** (steps and progress bar, "Read my website" with the reading status, the checklist of what stops going live, apply industry words, Go live) in form mode | C3 | **Test the agent** (a chat the owner tries; needed before going live) | F19 `/agent/test-chat` | built, waiting for the owner's check ([notes](../features/C2-setup-guide.md)) |
| C4 | **What you sell** (offerings and offers) and **suggested offerings** from the website reading | F17 | built, waiting for the owner's check ([notes](../features/C4-what-you-sell.md)) |
| C5 | **FAQs and unanswered questions** | F18 | built, waiting for the owner's check ([notes](../features/C5-faqs.md)) |
| C6 | **Settings → Website chat** (colour, greeting, buttons, allowed websites, the line to copy, Check installation, test page link) | F20 | built, waiting for the owner's check ([notes](../features/C6-channels-website-chat.md)) |
| C7 | **Settings → AI keys and models**, and Settings → Modules | F37, F03 | built, waiting for the owner's check ([notes](../features/C7-settings-ai-and-modules.md)) |
| C8 | **Contacts** (list, page, add, edit) | F04 | in progress: built (slices 1 list + add, 2 page + edit committed; 3 delete built), waiting for the owner's check of slice 3 ([notes](../features/C8-contacts.md)) |
| C9 | **Tickets** (list, page) | F14 | built: slice 1 (list + add, committed) and slice 2 (page + edit, notes, assign, close/reopen), waiting for the owner's check of slice 2 ([notes](../features/C9-tickets.md)) |
| C10 | **Pipeline** changes from the designer's note (drag and drop, column menu working, mobile Change status) and Settings → Pipeline | F06 | built, 3 slices (drag and drop + mobile Change status, add/rename column, delete/reorder column), committed locally 17 Nov 2026 ([notes](../features/C10-pipeline-changes.md)); a separate Settings → Pipeline list not built (column menu does it) |
| C11 | **Conversations** (the list of chats, summaries and what they became) if the owner wants it before the Inbox (F21) | F15 | to decide |
