---
name: c8-contacts
description: C8 Contacts screen progress: slice 1 (list+add) built, slice 2 (page+edit) and 3 (delete) next; token-cap slice done 17 Nov 2026
metadata:
  type: project
---

C8 Contacts, built in apps/web/src/features/contacts/. Slice 1: GET/POST /contacts (list, search, stage filter, Add panel). Slices 1-2 committed 17 Nov 2026 (674ac21; key rule + token cap in c9906c9). Slice 3 (delete, manager only) built, uncommitted, waiting for the owner's check; then C9 Tickets. Notes in docs/features/C8-contacts.md.

Also built 17 Nov 2026 (uncommitted, owner has not checked): C7 key-status card (no radio, migration 046) and platform monthly token cap (migration 047, decision R65/R66). See [[voice-uses-business-own-keys]].

**How to apply:** nothing committed yet; owner says "commit" per slice. Run `npm run db:migrate:test` when migrations are added (dev DB already has 046 and 047? 046 yes; 047 applied to both dev and test DB).

**C9 Tickets (17 Nov 2026):** C8 fully committed (e358425). C9 slice 1 (GET/POST /tickets list + add) built in apps/web/src/features/tickets/, uncommitted, waiting for the owner's check; slice 2 = ticket page + PATCH (notes, assign, close/reopen). Then C10 Pipeline changes, C11 Conversations (to decide).

Update 17 Nov 2026: uniformity commit 0c34da3 (Contacts/Tickets follow the Leads list pattern; shared features/shared/ListFilterPopover; TextField compact + isLabelHidden). C9 slice 2 (ticket page + PATCH) built, uncommitted. Web/phone call split proposal is R67 (for F29). Next after C9: C10 Pipeline changes.

**17 Nov 2026 later:** C10 pipeline done (a6d14d1 and the optimistic board 3428e58: dropped cards move at once, server told in background, rolled back on refusal; useKeptData stops blank reloads). Lesson: `position:absolute` sr-only labels inside an overflow container need a `relative` ancestor or they stretch the page.
