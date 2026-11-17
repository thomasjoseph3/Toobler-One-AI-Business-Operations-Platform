# C10: Pipeline changes (UI catch-up block, R64; the designer's note of 17 Nov 2026)

## Feature guide

**What it does.** The Pipeline board on the Leads page now works the way the designer asked: you move a lead by dragging its card to another column, and columns can be added, renamed, reordered and deleted.

**Why it is useful.** Moving a lead is the thing staff do most. Dragging is faster than opening a menu, and a business can make the columns match how it really sells (for example "Site visit booked").

**A day in the life.** Anita drags Priya's card from *New* to *Contacted*; the card lands there and a message says "Priya Nair moved to Contacted." She drags another card to *Lost*; a box asks why, she picks "Too expensive", and it is saved. On her phone she cannot drag, so she taps the card, opens the lead and presses **Change status**.

**Who can do what.** Everyone can move leads. Only managers change the columns (add, rename, reorder, delete).

**Never.** A lead is never lost without a reason. A column that still has leads is never deleted without choosing where its leads go. Won and Lost always stay last.

**Not part of it.** The quick actions on cards (Add activity, Add note) wait for notes and tasks (F07, F08).

## For the tech team

- **Slice 1 (1 route, built): `POST /leads/{id}/move`.** `LeadsBoard` cards are draggable (native drag and drop, no new package); columns accept a drop, show a ring and "Drop here to move the lead", and call `useLeadActions().moveLeadToStage` (Lost asks for the reason first). The card "…" menu is hidden below 768 px; on a phone the whole card is the link, and the lead page shows a **Change status** button (`ChangeStatusMenu`). The desktop card menu stays as the keyboard alternative to dragging.
- **Slice 2 (2 routes, planned):** column menu: add (`POST /pipeline/stages`) and rename (`PATCH /pipeline/stages/{id}`).
- **Slice 3 (2 routes, planned):** delete with "move the leads to…" (`DELETE /pipeline/stages/{id}?move_to=`) and reorder (`POST /pipeline/stages/reorder`), plus a Settings → Pipeline list.
