# Views, filters and search

**Phase 1 · CRM core · HubSpot equivalent: Saved views, Lists (active and static), Global search**

## What it is

Staff can filter any list (contacts, companies, leads, tasks) by any field, sort it, choose its columns, and save the
result as a named view, such as "Hot leads this week" or "My Kochi customers". A search box at the top finds any
contact, company or lead by name, phone or email.

## Why it matters

As a business grows, the full list is too long to scan. Views let each person see just what they work on.

## How it works

1. On Leads, Rahul filters: owner = me, temperature = hot, stage not Won/Lost.
2. He clicks **Save view**, names it "My hot leads", and it appears as a tab.
3. A manager can share a view with the whole team.
4. Typing "98470" in the top search finds every contact whose phone contains it.

**Lists** (a fixed group of contacts, like "Diwali offer 2026") are saved from any contacts view. They are used for
campaigns in Phase 4.

## Rules

- Filters work on built-in fields and custom fields.
- Search matches phone numbers however they are typed (+91, spaces, leading 0).
- Views respect roles: an "own leads only" staff member sees only their own rows in any view.

## Done when

- [ ] Filtering, sorting and choosing columns works on all four lists.
- [ ] Views can be saved, renamed, shared and deleted (with "Are you sure?").
- [ ] Search returns results within a second for a business with 50,000 contacts.

## For developers

- **Code folder:** `apps/api/src/core/views`
- **API:** [API.md](../../API.md), Phase 1 → Views, filters and search
- **Tables:** `saved_views` (`account_id`, `object`, `name`, `filters` jsonb, `columns`, `sort`, `owner_user_id`,
  `shared`); `contact_lists` and `contact_list_members` (static lists).
- **Indexes:** on `phone_key`, lower(name) trigram, email.
