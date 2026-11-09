# Duplicates and merging

**Phase 1 · CRM core · HubSpot equivalent: Duplicate management, Merge records**

## What it is

The system finds contacts and companies that are probably the same (same name and similar phone, same email with
different phone) and lets staff merge them into one, keeping every conversation.

## Why it matters

People change numbers, use a spouse's phone or give an office email once. Two records for one person split their
history and make reports wrong.

## How it works

1. Every night the system looks for likely duplicates.
2. **Contacts → Possible duplicates** shows pairs side by side with why they match.
3. Staff pick which value to keep for each field and click **Merge**, or click **Not the same**.
4. The merged contact has both timelines, all leads and all tasks.

## Rules

- Exact phone or email matches are never duplicates; they are joined automatically when created.
- Merging asks "Are you sure?" and can't be undone, but the activity log records both originals.
- "Not the same" pairs are never suggested again.

## Done when

- [ ] Likely duplicates show up the next morning.
- [ ] Merging keeps every activity, lead and task from both.

## For developers

- **Code folder:** `apps/api/src/core/duplicates`
- **API:** [API.md](../../API.md), Phase 1 → Duplicates and merging
- **Tables:** `duplicate_suggestions` (`account_id`, `object`, `a_id`, `b_id`, `reasons`, `status`).
