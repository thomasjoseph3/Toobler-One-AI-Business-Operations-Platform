# C8: Contacts screen

## Feature guide

**What it does.** The Contacts screen lists every person who has called, messaged or emailed the business (or was added by hand), with their phone, email and where they stand (New, Lead, Customer, Repeat customer, Not a fit). You can search by name, phone or email, filter by stage, and add a person.

**Why it is useful.** One place to find anyone, and to add someone who came in by word of mouth, before a lead is made for them.

**A day in the life.** A walk-in leaves their number. Staff open Contacts, press Add contact, type the name and phone and save. Later, when the person calls, the AI finds the same record instead of making a duplicate.

**Who can do what.** Managers and staff can list, add, open a contact and edit it (including marking or unmarking "Not a fit"). Delete is for managers only: the button is not shown to staff, and the API refuses them anyway.

**The contact page.** Click a name to open it: the name and stage, Call, WhatsApp and Email buttons, the details (phone, email, language, when added and last changed), and a Timeline place that fills in later. **Edit** opens a panel; only the boxes you changed are saved, an emptied box clears that detail, and the contact must keep a phone or an email. "Back to contacts" returns to the same search, stage and page.

**Deleting.** On the contact page a manager presses Delete and is asked "Delete <name>?". The contact leaves your lists; their leads stay and show "Contact removed"; the same phone or email can be added again later. Nothing is destroyed: the row and its history are kept.

**Limits.** A phone or an email is needed. A phone is stored in international form. The same phone or email cannot be added twice in one business.

**Never.** It never shows another business's contacts. Nothing is deleted for good (a delete hides the person; the data is kept).

**Not part of it.** Contact timelines (F07), tickets (C9), importing a file.

## For the tech team

- Slice 1 (2 routes): `GET /contacts` (search `q`, `lifecycleStage`, `page`, `limit` 25) and `POST /contacts`. No new backend; the screen is in `apps/web/src/features/contacts/` (`ContactsPage`, `ContactsList`, `CreateContactPanel`, `contacts-view.ts`, `contact-form.ts`, tests in `contacts-state.test.ts`).
- The search, stage and page live in the web address. The page is wired in `app/App.tsx`.
- Slice 2 (2 routes, built): `GET /contacts/{id}` (`ContactPage`, route `/contacts/:contactId`) and `PATCH /contacts/{id}` (`EditContactPanel`; `buildUpdateContactRequest` sends only changed fields, null to clear, `notAFit` only when the tick moved). Shared pieces: `ContactFormBoxes`, `contact-problem.ts`, `ContactNameLink`.
- Slice 3 (1 route, built): `DELETE /contacts/{id}` (manager only; soft delete). `ContactPage` shows Delete only to managers, asks through `ConfirmDialog` naming the contact, then returns to the list (same search and page) carrying "<name> was deleted.".
