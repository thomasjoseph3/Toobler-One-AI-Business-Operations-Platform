# C9: Tickets screen (UI catch-up block, R64)

## Feature guide

**What it does.** Tickets are complaints, questions and service requests, kept apart from sales leads so none get lost. The Tickets screen lists them (newest first, open ones to start with), lets you narrow the list, and lets you add one by hand.

**Why it is useful.** A customer who complains should never end up buried among sales enquiries. Here the team sees what still needs an answer, how urgent it is and who is looking after it.

**A day in the life.** A guest phones the front desk about a wrong bill. Staff press **Add ticket**, find the guest, write "Wrong bill on room 204", choose *Complaint* and *Urgent*, and save. The ticket appears at the top of the open list, marked Urgent, with nobody looking after it yet. The manager filters by *Unassigned* to see what needs an owner.

**Who can do what.** Everyone who is signed in (managers, staff and own-leads-only staff) can see and add tickets: tickets are shared work.

**Settings and limits.** Filters: status (Open, Closed, All), owner (Everyone, Mine, Unassigned), type and priority; 25 to a page. A title is needed (200 letters at most); details are optional (2000 at most). The person must already be a contact.

**Never.** It never shows another business's tickets. It never makes up a person: a ticket is always about a contact.

**The ticket page.** Click a ticket's title to open it: the title with priority, status and type; who it is about (a link to the contact); who looks after it; the details; and the notes. Buttons: **Assign to me**, **Remove owner**, **Edit** (title, details, type, priority), **Close ticket** and, on a closed ticket, **Reopen ticket**. Anyone can add a note, even to a closed ticket. A closed ticket cannot be edited or assigned until it is reopened. There is no team list yet (F02), so a ticket can be given to yourself or to nobody.

**Not part of it (yet).** Tickets made by the AI from conversations (F15) appear here by themselves. Assigning to another team member waits for F02.

## For the tech team

- Slice 1 (2 routes): `GET /tickets` (filters `status`, `ownerUserId` = person id / `me` / `unassigned`, `type`, `priority`, `page`, `limit`) and `POST /tickets` (`contactId`, `title`, `details`, `type`, `priority`). No new backend.
- Screen in `apps/web/src/features/tickets/`: `TicketsPage`, `TicketsList`, `CreateTicketPanel`, `ContactPicker` (uses `useContactSearch`), `tickets-view.ts`, `ticket-form.ts`, `tickets-state.test.ts`. Status, owner, type, priority and page live in the web address. Priority and status are shown as words in tags (colour is only a hint).
- Owner is shown as "Unassigned", "You" or "Team member" (the team list comes with F02, as on Leads).
- Slice 2 (2 routes, built): `GET /tickets/{id}` (`TicketPage`, route `/tickets/:ticketId`; `useApiResource<TicketDetail>`) and `PATCH /tickets/{id}` (one field at a time from the buttons: `ownerUserId`, `status`, `note`; the `EditTicketPanel` sends only changed fields via `buildUpdateTicketRequest`). A closed ticket answers 409 `TICKET_CLOSED` to field edits, shown as plain words. `TicketNameLink` remembers the list view for Back.
