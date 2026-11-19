---
name: ui-rebuild-v1-3
description: State and conventions of the UI rebuild on feature/ui-design-v1.3 (design system v1.3, Figma file, slices 1-9, what is left)
metadata:
  type: project
---

**Branch** `feature/ui-design-v1.3` (merged into `dev` on 13 Nov 2026, see [[git-repo-and-branches]]). One commit per slice.
**Figma** file key `uLzeTRYiei5PTnGqUoO4Ob` ("Dev - Toobler AI Business Operations Platform"), page "UI - in progress": frames Leads,
Leads - Sidebar Minimised, Leads Pipeline - Sidebar Minimised. The Figma MCP must be re-authorised when it drops (call authenticate,
the owner opens the link). Only these frames exist: every other screen is designed by us in the same style and flagged in
`docs/FRONTEND.md` section 5 for the designer. Screens the designer is making themselves (next activity, notes, calls, meetings): do not design.

**Status at the end of Fri 13 Nov 2026:** slices 1-9 are merged into `dev` and pushed to GitHub. Slice 10 (the lead page) is committed (746664e) on branch `feature/ui-lead-page` (cut from `dev`) but NOT merged and NOT pushed: ask before pushing or merging. The owner said the next step waits until Monday 16 Nov.

**Done (slices):** 1 tokens, fonts, Tag, Checkbox, Figma icons and logo; 2 sign-in; 3 shell (sidebar, top bar, account menu); 4 Leads list;
5 Filter and Sort (kept in the web address); 6 Create lead (side panel, search or add person); 7 row menu (move stage, Lost reason dialog,
assign to me, delete for managers behind Are you sure), fixed page frame, crisp more icon; 10 the lead page (/leads/:id, own page, Edit details sends only changed fields, Call/WhatsApp/Email links, Actions menu, Timeline placeholder); 8 Pipeline board (layout=pipeline,
card menu only, no drag and drop); 9 collapsed sidebar (68 px). Backend added: `sort` and `order` on GET /leads, total in the same
query. Demo data: `npm run db:seed:demo -- --allow-remote` (login manager@demo.toobler.example, a demo business "Demo: Nair Stays").

**Conventions:** components only from `packages/ui` (tokens `bg-surface`, `text-text-primary`, `border-border-default`, `text-body-md`...),
all words through `t()` in `apps/web/src/app/i18n.ts`, feature code in `apps/web/src/features/<name>/` with pure logic in its own tested
file, data through `useApiResource`, actions through `useLeadActions`. Tailwind base spacing is 4 px (`--spacing: 4px`).
e2e uses a pretend API in `e2e/support.ts` (extend it per screen); hidden and visible copies (table and phone cards): use
`locator('visible=true')` and exact names. Every new component goes in the `/dev/ui` gallery.

**Left / ideas (Monday):** the owner has not picked yet: my recommendation is Tickets (list and page, reuses every pattern), then Contacts (also settles editing the contact from the lead page), or F15 (needs three owner decisions: how to feed and test the router, store messages now, which AI key and model). Also pending: what "progress of each lead" means for R54, and the offered local Docker development database. Screens: tickets, contacts, business profile, offerings, FAQs, settings screens; pipeline card progress (R54);
Import and Export (F12); search (F11); notifications (F23); owner names (F02); working hours (R52); lead source values (R51); industry
labels for dates (R53). Backend: F15 then F19, F20, F31.
**Speed note:** the Supabase development database costs about 2 s per API call; the owner will get a nearer database, so do not optimise
per-request overhead for it (local Docker dev DB offered, not yet set up).
