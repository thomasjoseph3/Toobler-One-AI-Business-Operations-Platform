# core.module_switches: which parts of the product each business has

Built in slices of at most 2 API routes (see `docs/features/F03-modules.md`).

| Folder | What is in it |
| --- | --- |
| `routes/` | `modules.routes.ts` (`GET /modules`, `PATCH /modules/{id}`) |
| `services/` | `modules.service.ts`: listing, switching on and off (with the dependency rules), and `grantStartingModules` for sign-up |
| `repositories/` | `account-modules.repository.ts`: the SQL for the `account_modules` table |
| `helpers/` | `module-catalogue.ts` (every Phase 1 module and what it needs) and `module-state.ts` (pure rules: state of a module, what a switch does) |

Three switches: **entitled** (the plan; only Toobler sets it), **enabled** (the manager), **ready** (channels connected;
always true until F25). A module with no row is simply not in the plan. Switching off keeps the data.
