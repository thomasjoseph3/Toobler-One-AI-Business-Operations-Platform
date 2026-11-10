---
name: plug-in-module
description: How to add or change a plug-and-play module in this project - a core module, an engine (leads, later sales/service/marketing), a channel (webchat, WhatsApp, email, phone, later SMS/Instagram), or a feature add-on (follow-ups, assistant, competitors). Use when creating a module folder, a module manifest, a ChannelAdapter, agent tools, event subscriptions, jobs, conversation types/outcomes, UI slots or presets, or when wiring a later-phase engine onto the lead engine.
---

# Adding a plug-in module

Architecture: `docs/ARCHITECTURE.md` (§1 modules, §2 conversation engine, §4 events, §5 outcomes, §6 later phases).

## Folder

```text
apps/api/src/modules/<core|engines|channels|features>/<name>/
  module.ts      defineModule({...}): the only thing the kernel reads
  index.ts       public API for modules that list this one in `requires`
  routes.ts  service.ts  repository.ts  schemas.ts
  adapter.ts     channels only (ChannelAdapter)
  *.test.ts  *.api.test.ts
apps/web/src/features/<name>/      pages, nav items, slot components, registered in index.ts
```

Add the module to the module list (`apps/api/src/modules/index.ts`) and, for the web app,
`apps/web/src/features/index.ts`. Nothing else in existing modules changes.

## Checklist
- [ ] `id` is `<kind>.<name>`; `kind` is `core | engine | channel | feature`; `requires` lists every module whose
      `index.ts` it imports.
- [ ] Routes are declared in the manifest (the kernel adds the "module active" guard); pages call
      a `<RequireModule id="<id>">` wrapper on their routes (a switched-off module shows the not-found page).
- [ ] Tables: own migration, `account_id`, RLS; tables are named for the module's things (`quotes`, not `sales_data`).
- [ ] Reacts to other modules only through `events` (idempotent handlers); publishes its own events via `accountContext.publish`
      in the same transaction as the change. Document new events in ARCHITECTURE.md §4.
- [ ] Agent tools live in `apps/api/src/agents/tools/` (not in the module), as thin wrappers over this module's `index.ts`:
      zod input, `effect`, `module` set to this module's id; identity from `ToolContext`; offered only while active.
      Modules never import `agents/`; agents import a module only through its `index.ts`.
- [ ] Conversation types / outcomes / playbooks it adds are declared in the manifest, with a fallback when it's off.
- [ ] UI: nav items and slot components registered; nothing edited in another module's pages.
- [ ] Settings: zod schema stored in `account_modules.settings`.
- [ ] `health()` for channels and anything with an outside connection.
- [ ] Switching it off: routes 404, tools gone, menu gone, data kept; switching on restores everything. Tested.
- [ ] Industry presets (stages, fields, types, words) in `apps/api/src/industries/`, data only.

## Channels
A channel adapter only translates: `resolveAccount` (provider id → business, via `across-accounts.ts`),
`parseInbound` → `NormalisedInbound[]`, `send`, `capabilities`, `connect`/`disconnect`, `health`. Webhook routes go in
`webhooks` (signature check on the raw body, then enqueue a job). Never put agent, contact, lead or classification
logic in a channel: the conversation engine does that for every channel.

## Later engines attaching to the lead engine
Use the lead module's **public** functions (`leads/index.ts`) and its events (`lead.won`, `lead.stage_changed`, …),
fill UI slots (`lead.sidebar`, `lead.card.badges`), add tools and outcome kinds. If the lead engine lacks a hook you
need, add a public function or event to it in a small, separate change, never reach into its repository.
