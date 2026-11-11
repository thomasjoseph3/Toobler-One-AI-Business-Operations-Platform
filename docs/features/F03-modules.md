# F03: Modules, plug and play

**Requirements:** `1-foundation/03-engines-and-plans.md`; docs/ARCHITECTURE.md §1
**Depends on:** F00, F01      **Module:** `core.module_switches` (core)

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
| 2 | `POST /platform/businesses/{id}/modules`, `GET /me` (extended) | Platform entitle, module guard on routes, active modules in `/me` |
| UI | Settings → Modules, menu from `/me`, platform page | **Deferred** until the designer's screens arrive |

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

## Manual test (written when each slice is built)
