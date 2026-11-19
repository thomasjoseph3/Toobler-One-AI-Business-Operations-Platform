---
name: ui-catchup-before-backend
description: UI catch-up block C1-C11 (owner decision 17 Nov 2026): status, how each slice is built and tested, what comes next, F31 paused
metadata:
  type: project
---

Owner decided on 17 Nov 2026 (R64): build the missing staff screens FIRST (block C1-C11, plan in `docs/plan/STATUS.md` section "UI catch-up block"), then build every later feature backend AND screens together. F31 (setup wizard) is paused after slice 4; its slice 5 (setup chat, `POST /setup/chat`) comes after the block.

**Done and committed on branch `feature/F31-setup-wizard` (17 Nov 2026), waiting for the owner's check:** C1 Business profile (/knowledge), C2 Setup guide (/setup, hidden from the sidebar), C3 Test the agent (/knowledge/test-agent), C4 What you sell (/knowledge/what-you-sell), C5 FAQs (/knowledge/faqs), C6 Channels (/channels), C7 Settings AI + Modules (/settings, /settings/modules). Each has notes at `docs/features/C<n>-*.md` with a feature guide, tests and a manual script; screenshots in a folder of the same name.
**Next:** C8 Contacts (list, page, add, edit), C9 Tickets (list, page), C10 designer's pipeline note (drag and drop, working column menu, mobile Change status; see end of `docs/features/F06-pipeline-and-leads.md`), C11 conversations list (owner to decide). Then back to features in STATUS.md order (F31 slice 5, F02, F05, ...).

**How a UI slice is built (repeat it):** existing routes only; pure logic in its own tested file (`apps/web/src/features/<name>/`), screens with loading/error/empty states, all words through `t()` in `apps/web/src/app/i18n.ts`, components only from `packages/ui`; keep last good data while reloading with `useKeptData` (a remount or reload must never lose a "Saved." message or typed text: don't `key=` a card on its own saved data); links inside sentences underlined; delete asks "Are you sure?" naming it. Browser tests in `e2e/<name>.spec.ts` against a pretend API file `e2e/pretend-<name>.ts` wired into `e2e/support.ts` (phone 375 and desktop 1280; axe accessibility check; run with `--repeat-each=3` to catch flakiness; selectors: use exact names, `getByRole('alert')`, avoid `check()` on controlled radios that revert). Run only the relevant specs plus shell/accessibility; long runs go in the background writing to the scratchpad file, then read it. Take screenshots with a temporary `e2e/zz-screens.spec.ts` (delete it after). Then update STATUS.md, FRONTEND.md section 5, hand off with how to try it, and wait for "commit"/"continue".
**Commit rule reminder:** commit only when the owner says "commit" (they often say "commit and continue").
**Dev DB:** migrations 042-045 were applied to the Supabase dev database with `npm run db:migrate` (owner allows repo commands there). Tests use the local test DB.
**Why:** the owner could not see most of what exists and wants to learn how everything works; see [[ui-rebuild-v1-3]], [[small-api-slices]], [[feature-gate-workflow]].
