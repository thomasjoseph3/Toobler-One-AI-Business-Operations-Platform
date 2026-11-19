# F03: Modules, plug and play

**Requirements:** `1-foundation/03-engines-and-plans.md`; docs/ARCHITECTURE.md §1
**Depends on:** F00, F01      **Module:** `core.module_switches` (core)

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
Each business has its own switches for the parts of the product: the lead engine, website chat, WhatsApp, email, phone, follow-ups, the staff assistant and the competitor report. A part that is switched off disappears: its menu item is hidden, its pages answer "not found", and the AI does not use it. **Nothing is deleted**: switch it back on and everything is as it was.

### Why it is useful
- **Pay for what you use, use what you pay for.** Toobler decides which parts a business's plan includes; the business then chooses which of those to turn on.
- **A calmer app.** A business that does not use WhatsApp never sees WhatsApp.
- **Safe changes.** A part that another part depends on cannot be switched off by accident without switching off what needs it.

### How it works: a day in the life
1. A new business starts with the lead engine and website chat included and switched on.
2. The owner opens the module list and sees each part as **active**, **off**, **not in your plan** or **needs connecting**.
3. The manager switches website chat off for a week; the chat widget stops answering, its data is kept; they switch it back on and it works again.
4. The owner wants WhatsApp, which is not in the plan. Toobler adds it to the plan (platform side); now the manager can switch it on.

### Who can do what
- **Everyone signed in** can see the list.
- **Managers** can switch a part on or off, but only if it is in the plan.
- **Toobler's platform team** decides what is in a business's plan.

### What it will never do
- Let a business switch on a part that is not in its plan.
- Delete a business's data when a part is switched off.
- Allow a part to be on while the part it needs is off.

### Not part of this feature
The screens (Settings → Modules, the menu built from the list, the platform page), the per-channel "connected and healthy" check (each channel feature), and plans and billing (F35).

### For the tech team
- **Module:** `core.module_switches` (core). Migration `008_modules.sql`: table `account_modules` (fenced; `entitled`, `enabled`, timestamps, `settings`). Column grants keep `entitled` out of the app role's reach, so only the platform path can grant a module.
- **Three switches:** `entitled` (the plan allows it; platform only), `enabled` (the business wants it), and *ready* (for channels, arrives with each channel). A module is **active** only when entitled and enabled (and ready), and its `requires` are active.
- **The catalogue** is a plain list: `engine.leads`, `channel.webchat`, `channel.whatsapp`, `channel.email`, `channel.phone`, `feature.followups`, `feature.assistant`, `feature.competitors`. Core modules are always on and have no row. A test keeps real module manifests matching the catalogue.
- **The gate:** the kernel finds the real gate through the module manifest (`moduleGate`). Routes, jobs, event handlers and agent tools of an inactive module answer 404 or are skipped. A business's answer is cached for 10 seconds; any change on the same server clears it.
- **Routes:** `GET /modules`, `PATCH /modules/{id}` (409 `NOT_IN_PLAN`, 409 `NEEDS_MODULE`), `POST /platform/businesses/{id}/modules` (platform), and `GET /me` now lists the active modules. Changes write the activity log and publish `module.enabled` / `module.disabled`.
- New businesses start with `engine.leads` and `channel.webchat` entitled and enabled.

### Known limits
- No screens yet (designer).
- Voice and other paid channels will run on the business's own keys (decision, 11 Nov 2026); that arrives with F25 and F29.

---

**Goal in one line:** each business has its own switches for the parts of the product (lead engine, website chat,
WhatsApp, and so on). A part that is off is hidden: its routes answer 404, its menu items go, and its data is kept.

## Three switches per module (ARCHITECTURE.md §1)
| Switch | Meaning | Who changes it |
| --- | --- | --- |
| `entitled` | The plan allows this module | Platform admin only |
| `enabled` | The business wants it | The business's manager, and only when entitled |
| ready | For channels: connected and healthy | Arrives with each channel (F20, F25...). Until then a channel counts as ready. |

A module is **active** only when entitled and enabled (and ready). A module whose `requires` is not active cannot be
turned on, and turning an engine off turns off the features that need it.

## Scope
- In:
  - The table `account_modules` and the real module gate (replaces `coreOnlyGate`).
  - The catalogue: every Phase 1 module declared with id, kind, name, one-line description and what it requires:
    `engine.leads`, `channel.webchat`, `channel.whatsapp`, `channel.email`, `channel.phone`, `feature.followups`,
    `feature.assistant`, `feature.competitors`. Core modules are always on and have no row.
  - The module guard on routes: an inactive module's routes answer 404.
  - `GET /modules`, `PATCH /modules/{id}`, `POST /platform/businesses/{id}/modules`, and active modules in `GET /me`.
- Out (later): the screens (Settings → Modules, the menu from `/me`, the platform page: deferred until the designer's
  screens arrive); the "ready" check per channel (each channel feature); plans and billing (F35); the agent's tool
  filtering (F19, it will ask the same gate).

## Decisions (owner, 11 Nov 2026)
1. New businesses start with `engine.leads` and `channel.webchat` in the plan and switched on; everything else is added by Toobler.
2. The catalogue is a plain list in `core.module_switches`; a test keeps real manifests matching it.
3. Voice and other paid channels will run on the business's **own** keys (stored encrypted in `connections`, from F25/F29). The
   web call is not default-on and no shared Toobler key is used.
4. The module was renamed from `core.modules` to `core.module_switches` so the path does not read "modules inside modules".
5. The kernel finds the real gate through the module manifest (`moduleGate`), the same way it finds the authenticator.
   A business's answer is remembered for 10 seconds; any change on the same server clears it at once.

## Open decisions (closed above)
1. **What a new business gets at sign-up.** *Recommended:* `engine.leads` and `channel.webchat` entitled and enabled; the
   other modules not entitled until you grant them. Existing businesses get the same through the migration.
2. **Catalogue versus manifests.** Modules such as `engine.leads` have no code yet. *Recommended:* the catalogue is a plain
   list in `core.module_switches`; when a real module arrives its manifest must match the catalogue (a test checks it), so a
   module can never exist without a switch.

## Build order (slices of at most 2 routes)
| Slice | Routes | Content |
| --- | --- | --- |
| 1 | `GET /modules`, `PATCH /modules/{id}` | Migration, catalogue, repository, service, the two routes, dependency rule. **Done and tested by the owner.** |
| 2 | `POST /platform/businesses/{id}/modules`, `GET /me` (extended) | Platform entitle, the real module gate, active modules in `/me`. **Done and tested by the owner.** |
| UI | Settings → Modules, menu from `/me`, platform page | **Deferred** until the designer's screens arrive (owner decision, 11 Nov 2026: the front end stays on hold) |

## Reused from the hotel agent
- Read: `src/modules/core/platform/*` (113 lines of service) and `src/modules/core/industries.js`.
- **Reused:** the idea of a registry that the core asks instead of naming things itself; a platform-only area for the
  Toobler team, separate from business roles; platform actions returning counts, never a business's records.
- **Changed, and why:** the old app had no per-business switches (every business got everything its industry gave), so
  `account_modules`, the three switches and the guard are new. The old platform console onboarded businesses by hand;
  ours has owners sign up alone (F01), so the platform area only grants or removes modules.
- **Left behind:** the hotel-specific industry bundles.

## Database (migration `008_modules.sql`)
| Table | Fenced? | Columns |
| --- | --- | --- |
| `account_modules` | Yes (`account_id`, RLS forced) | `account_id`, `module_id`, `entitled`, `enabled`, `enabled_at`, `disabled_at`, `settings` (jsonb, default `{}`), `created_by`, `updated_by`, `created_at`, `updated_at`; primary key (`account_id`, `module_id`) |

The app role may read and write its own rows, but a database rule keeps `entitled` out of its reach (column grants, the
way `is_platform_admin` is protected), so a bug in business code can never grant a module. Only the platform path
(`across-accounts.ts`) sets `entitled`. The migration is applied to Supabase only on "apply it".

## API (under `/api/v1`)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/modules` | Staff | Every catalogue module with `state`: `active`, `off` (entitled, switched off), `not_in_plan`, `needs_connecting` |
| PATCH | `/modules/{id}` | Manager | `{ enabled: boolean }`. 409 `NOT_IN_PLAN`, 409 `NEEDS_MODULE` (names the engine), 404 for an unknown id |
| POST | `/platform/businesses/{id}/modules` | Platform | `{ moduleId, entitled }`. Removing a module's entitlement also switches it (and what depends on it) off. |
| GET | `/me` | Staff | Now also lists the business's active modules |

## Rules to enforce
- Staff cannot toggle: 403. Another business's id on the platform route that does not exist: 404.
- Switching off keeps rows and data; switching on again restores them.
- Every change is recorded in the activity log with the actor, and publishes `module.enabled` / `module.disabled`.
- Core modules cannot be listed as switchable.

## Tests (each route: works, 401, 403, 404, 400)
A disabled module's route answers 404; re-enabling keeps data; a feature cannot be enabled without its engine and goes
off when its engine goes off; staff cannot toggle; a business cannot enable a module it is not entitled to; the app role
cannot write `entitled`; the catalogue matches the manifests; the schema test sees `account_modules` fenced.

## Hand-off (11 Nov 2026)
`npm run verify` is green: 368 API and unit tests, 94 Playwright tests (2 skipped as before). Four module test files
(`modules`, `modules-platform`, `modules-gate`, `modules-journeys`) plus the unit tests of the rules. Each protection was
broken once on purpose and a test failed. The migration `008_modules.sql` is applied to Supabase. The screens are deferred.

## Manual test (Postman; send `Origin: http://localhost:3000` and `X-Requested-With: toobler-web` on every POST and PATCH)
Sign in first with `POST /api/v1/auth/login`. You need two people: yourself (platform admin) and, for the 403 checks, a
second sign-up that is an ordinary business manager.

| # | Request | Expect |
| --- | --- | --- |
| 1 | `GET /modules` | 200, 8 items; `engine.leads` and `channel.webchat` are `active`, the rest `not_in_plan` |
| 2 | `PATCH /modules/channel.webchat` `{"enabled":false}` | 200, it shows `off`; sending it again changes nothing |
| 3 | `PATCH /modules/channel.webchat` `{"enabled":true}` | 200, `active` again |
| 4 | `PATCH /modules/channel.whatsapp` `{"enabled":true}` | 409 `NOT_IN_PLAN` |
| 5 | `PATCH /modules/channel.telegram` `{"enabled":true}` | 404 |
| 6 | `PATCH /modules/channel.webchat` `{}` | 400 |
| 7 | `POST /platform/businesses/<business id>/modules` `{"moduleId":"channel.whatsapp","entitled":true}` | 200, it shows `off` |
| 8 | `PATCH /modules/channel.whatsapp` `{"enabled":true}` | 200, `active` |
| 9 | `GET /me` | `activeModules` lists Lead engine, Website chat, WhatsApp |
| 10 | `POST` the platform route with `{"moduleId":"engine.leads","entitled":false}` | 200; `engine.leads` is `not_in_plan` and features that needed it are `off` |
| 11 | Put it back with `"entitled":true` | `engine.leads` is `off` (the business switches it on) |
| 12 | The platform route with a random uuid / `channel.telegram` / `abc` | 404 / 404 / 400 |
| 13 | The platform route as an ordinary manager | 403 |
| 14 | Any module route without the cookie | 401 |

The browser steps (switch a channel off and on and watch its menu item go and come back) wait for the screens.
