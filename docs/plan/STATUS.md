# Feature status

The single source of truth for what is being built. Rules ([DEVELOPMENT.md](../DEVELOPMENT.md)): at most one feature is
`in_progress` or `in_review`; a feature starts only when every feature above it is `approved` or `deferred`.
`npm run gate` reads this table: keep its columns and status words exactly.

Statuses: `planned`, `in_progress`, `in_review`, `approved`, `deferred`.

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
| F14 | Tickets | planned | | |
| F16 | Business profile, business questions and situations | planned | | |
| F17 | Offerings and offers | planned | | |
| F18 | Documents, FAQs, knowledge search and unanswered questions | planned | | |
| F15 | Conversation types and the router | planned | | |
| F19 | The AI agent (text) and Test the agent | planned | | |
| F20 | Website chat | planned | | |
| F31 | Setup wizard and fill from website | planned | | |
| F02 | Team, roles, teams and the activity log | planned | | |
| F05 | Companies | planned | | |
| F07 | Timeline and notes | planned | | |
| F08 | Tasks and reminders | planned | | |
| F09 | Custom fields | planned | | |
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
| **F01-UI: the auth screens** (sign-in, sign-up, verify email, forgot and reset password, profile, full-stack browser tests) | The designer is making the screens. The owner approved the F01 **backend** on 2026-11-11 (8 slices, all tested by the owner) and parked the screens. | UI slice 1 (sign-in, sign-out, the guard, the API client) is built on the local branch `feature/F01-ui-sign-in`, commit `0d78997`. It works, and the designer's look goes on top. UI slices 2 to 6 are planned in the F01 brief. |
| **F03-UI: the module screens** (Settings → Modules, the menu built from `/me`, the platform page) | The designer is making the screens; the owner put the front end on hold (11 Nov 2026). The F03 backend is built and tested. | Planned in the F03 brief. |
| **API docs (Swagger / OpenAPI)** | The routes already describe their shapes with zod, so a docs page can be generated. It is a small feature of its own, planned right after F03 is approved (owner agreed 2026-11-11). Packages to be vetted first; served in development only. | Built and merged (`/docs`, development only); brief: [API-docs-swagger.md](../features/API-docs-swagger.md). |

When the designer's screens arrive, the F01-UI work is done as slices (one screen at a time, owner testing each), and it is approved separately.
