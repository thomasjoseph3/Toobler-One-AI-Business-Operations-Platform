# Contacts

**Phase 1 · CRM core · HubSpot equivalent: Contacts, Contact management, Lifecycle stages**

## What it is

A contact is one person the business deals with. Every call, message, email, lead, task and note about that person is
gathered on their contact page, so anyone on the team can see the whole story in one place.

## Why it matters

Without it, a customer who called on Monday and WhatsApped on Tuesday looks like two strangers. Staff ask the same
questions twice, and the customer feels unknown.

## How it works

1. Priya calls the business. The AI looks up her phone number. No match, so it creates a new contact "Priya" with her
   number.
2. The next day she WhatsApps from the same number. The AI finds her contact and adds the chat to it.
3. A staff member opens **Contacts → Priya** and sees her details, her leads, her timeline and her tasks.
4. They add her email and her company, and the change is saved with their name and the time.

**Lifecycle stage** is one field on every contact that says where they stand overall. It moves forward on its own:

| Stage | Set when |
| --- | --- |
| New | Contact is created |
| Lead | They have an open lead |
| Customer | One of their leads is Won |
| Repeat customer | Two or more Won leads |
| Not a fit | Staff mark them so (spam, wrong number, never buying) |

## Rules

- A contact is found by the last 10 digits of their phone, otherwise by email.
- Two contacts never share a phone number or email in one business.
- The AI fills in only what the customer said. It never guesses a name.
- Every change is stamped with who made it (a person or "AI agent") and when.

## Screens

- **Contacts list:** name, phone, company, lifecycle stage, owner, last activity; search, filters, saved views (see
  [views](08-views-filters-and-search.md)).
- **Contact page:** details on the left (with custom fields), timeline in the middle, leads, tasks and company on the
  right. Buttons: Call, WhatsApp, Email, Add note, Add task, New lead.

## Done when

- [ ] A call, a WhatsApp message, a chat and an email from the same person all land on one contact.
- [ ] Staff can add, edit and (with "Are you sure?") delete a contact.
- [ ] Lifecycle stage moves by itself when a lead is created and when one is Won.
- [ ] Every change shows who made it and when.

## Better than HubSpot

- The contact fills itself from conversations. In HubSpot, staff type most of it.
- Phone number is the main key, because Indian customers call and WhatsApp far more than they email.

## For developers

- **Code folder:** `apps/api/src/core/contacts`
- **API:** [API.md](../../API.md), Phase 1 → Contacts
- **Table:** `contacts` (`account_id`, `name`, `phone`, `phone_key` (last 10 digits, unique per
  account), `email` (unique per account when set), `company_id`, `lifecycle_stage`, `owner_user_id`, `language`,
  `custom` (jsonb), `created_by`, `updated_by`, timestamps).
- **Agent:** contact lookup and save inside `save_lead` (see [agent](../3-ai-agents-and-channels/02-how-the-agent-behaves.md)).
- **Tests:** phone matching across formats (+91, 0, spaces), cross-business isolation.
