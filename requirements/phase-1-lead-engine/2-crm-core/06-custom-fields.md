# Custom fields

**Phase 1 · CRM core · HubSpot equivalent: Custom properties, Required fields**

## What it is

Each business adds its own fields to contacts, companies and leads: a wedding planner adds "wedding date" and
"guest count", a car dealer adds "model" and "trade-in". **The AI asks customers for these fields too.**

## Why it matters

Every business needs different details. Without custom fields, staff keep them in notes where nobody can filter or
report on them.

## How it works

1. The manager opens **Settings → Fields → Leads → Add field**: "Car model", type Dropdown, options "Swift, Baleno,
   Brezza", marked "AI should ask".
2. On the next call, the AI asks "Which model are you interested in?" and saves the answer.
3. Staff see "Car model: Brezza" on the lead and can filter the board by it.

**Field types:** Text, Number, Date, Dropdown (one choice), Yes/No, Phone, Email.

**Each field has:** label, type, options (for Dropdown), "AI should ask" on or off, "Required before Won" on or off,
and an order.

## Rules

- Industry presets add a few fields at sign-up, which the business can change or remove.
- Removing a field asks first; its saved values are hidden, not deleted, for 30 days.
- The AI asks at most three custom questions per conversation, in field order, and never pushes if the customer won't
  say.

## Screens

- **Settings → Fields:** a tab each for Contacts, Companies, Leads; add, edit, reorder, remove.
- Custom fields appear on detail pages, in filters, in list columns and in import/export.

## Done when

- [ ] A manager adds each field type and staff can fill and filter by it.
- [ ] A field marked "AI should ask" is asked on calls and chats and saved correctly.
- [ ] "Required before Won" stops a lead moving to Won until filled.

## Better than HubSpot

- The AI collects the business's own fields from customers. In HubSpot, someone has to type them in.

## For developers

- **Code folder:** `apps/api/src/core/fields`
- **API:** [API.md](../../API.md), Phase 1 → Custom fields
- **Table:** `field_definitions` (`account_id`, `object` in `contact`/`company`/`lead`, `key`, `label`, `type`,
  `options` jsonb, `ai_asks`, `required_for_won`, `sort`, `archived_at`); values in each object's `custom` jsonb.
- **Validation:** one shared check, used by the API and by the agent tools, validates values against the definition.
- **Agent:** the prompt lists `ai_asks` fields; `save_lead` accepts `custom` and validates it.
