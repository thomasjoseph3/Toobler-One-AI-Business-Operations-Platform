# Companies

**Phase 1 · CRM core · HubSpot equivalent: Companies, Associations**

## What it is

A company is a firm, school, family or group that contacts belong to. A travel agent's contact "Rahul" might belong to
"Infosys HR", which books trips for many staff. The company page shows all its people and all their leads together.

## Why it matters

Many enquiries come from someone acting for a group. Without companies, the business can't see that five enquiries
this year came from the same firm.

## How it works

1. Rahul calls and says he's booking for Infosys HR. The AI saves "Infosys HR" as his company.
2. Next month Meera from Infosys HR WhatsApps. Staff link her to the same company.
3. The company page shows Rahul and Meera, every lead from either of them, and the total won.

## Rules

- A contact belongs to at most one company.
- Companies are matched by name ignoring case and spaces; if the email domain matches a known company (for work email
  addresses, not gmail.com and the like), staff are offered that company.
- Deleting a company asks first and keeps its contacts (they just lose the link).

## Screens

- **Companies list:** name, number of contacts, open leads, won value, owner.
- **Company page:** details and custom fields, contacts, leads, combined timeline.
- **Contact page:** a Company box to link or change.

## Done when

- [ ] Staff can create a company, link contacts, and see all their leads on the company page.
- [ ] The AI can save a company name it hears.
- [ ] Deleting a company keeps its contacts.

## For developers

- **Code folder:** `apps/api/src/core/companies`
- **API:** [API.md](../../API.md), Phase 1 → Companies
- **Table:** `companies` (`account_id`, `name`, `name_key`, `domain`, `phone`, `city`, `owner_user_id`, `custom`
  jsonb, timestamps); `contacts.company_id`.
- **Agent:** `save_lead` accepts `company_name`.

## Open questions

- Should "family" be a separate kind for hotels and travel, or is "company" a fine word for all?
