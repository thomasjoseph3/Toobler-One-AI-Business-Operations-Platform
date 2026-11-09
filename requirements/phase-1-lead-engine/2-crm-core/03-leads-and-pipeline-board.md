# Leads and the pipeline board

**Phase 1 · CRM core · HubSpot equivalent: Leads, Deals, Deal board, Pipeline management, Lead management**

## What it is

A lead is one enquiry that might become a sale: "Priya, 3 nights in December, 4 people". Leads sit on a **board** with
one column per stage. Staff drag a lead from New to Contacted to Quoted, and finally to Won or Lost.

## Why it matters

This is how a business sees, at a glance, how many enquiries are waiting, who is following up what, and how many turn
into sales.

## How it works

1. The AI finishes a call with Priya and saves a lead: what she wants, her dates, party size, budget and the callback
   it promised. The lead starts in **New**, owned by whoever is next in turn.
2. Rahul from sales calls her and drags the card to **Contacted**.
3. He sends a price from his own system and moves it to **Quoted**.
4. She agrees: he drags it to **Won**. Or she doesn't: he drags it to **Lost** and picks a reason ("too costly",
   "went elsewhere", "dates not available", "no reply", "other").
5. If Priya enquires again within 60 days, it goes onto the same open lead. After a lead is closed for 60 days, a new
   enquiry starts a new lead.

**Default stages** (the business can rename, add, remove and reorder them):

New → Contacted → Quoted → Won / Lost

**Industry presets** fill in better words at sign-up, e.g. hotels: New → Called → Rate sent → Booked / Lost.

**Sharing out new leads** (the business picks one): all to one person; round-robin across a team; or by offering
(e.g. weddings to Anil).

## Rules

- Won and Lost always exist and can't be removed; they close the lead.
- Lost always needs a reason.
- Moving a lead adds a line to its timeline ("Rahul moved this to Quoted").
- Removing a stage that still has leads asks where to move them.

## Screens

- **Leads → Board:** a column per stage with count; cards show name, interest, dates, temperature, owner, time since
  last activity; drag to move.
- **Leads → List:** the same leads as rows with filters (see [views](08-views-filters-and-search.md)).
- **Lead page:** details, custom fields, timeline, transcripts and recordings, tasks; buttons Call, WhatsApp, Move
  stage, Assign, Note.
- **Settings → Pipeline:** rename, add, reorder stages; lost reasons; how new leads are shared out.

## Done when

- [ ] Every channel's enquiry creates or updates a lead on the board.
- [ ] Staff can drag a card between columns on a computer and move it with a button on a phone.
- [ ] Lost needs a reason.
- [ ] Round-robin shares new leads evenly across a team.
- [ ] A manager can rename and reorder stages.

## Better than HubSpot

- Leads arrive on the board already filled in, scored and summarised by the AI, at any hour.
- One simple record from enquiry to sale, instead of HubSpot's separate leads and deals.

## For developers

- **Code folder:** `apps/api/src/core/leads`
- **API:** [API.md](../../API.md), Phase 1 → Leads and the pipeline board
- **Tables:** `pipelines` (`account_id`, `name`; one per business in Phase 1), `pipeline_stages` (`pipeline_id`,
  `name`, `sort`, `kind` in `open`/`won`/`lost`), `leads` (`account_id`, `contact_id`, `company_id`, `stage_id`,
  `temperature`, `temperature_reason`, `interest`, `offering_id`, `date_from`, `date_to`, `party_size`, `budget`,
  `promise`, `callback_at`, `owner_user_id`, `team_id`, `first_channel`, `last_activity_at`, `lost_reason`, `custom`
  jsonb, `closed_at`), `lost_reasons` (`account_id`, `label`, `sort`), `assignment_rules` (`account_id`, `mode`,
  `team_id`, `user_id`, `offering_id`).
- **Agent:** `save_lead` creates or updates the open lead.
