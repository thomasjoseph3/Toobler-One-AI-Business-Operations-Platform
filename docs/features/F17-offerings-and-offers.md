# F17: Offerings and offers

**Requirements:** `3-ai-agents-and-channels/01-business-info-and-offerings.md`; `requirements/API.md` (Business info and offerings); `2-crm-core/03-leads-and-pipeline-board.md` ("sharing out new leads: by offering"); docs/plan/PHASE-1.md (F17)
**Depends on:** F00, F01, F04, F06, F16      **Module:** `core.offerings` (core: always on, no switch)
**Status:** in progress. The owner chose all five defaults and said "continue" on 12 Nov 2026. (F16 is merged into `dev` as c19cb16.)

**Goal in one line:** what the business sells, written down once so the AI can answer "how much is a family room, and what is included?" correctly: each
**offering** has a name, a description, a "from" price in paise, a unit (per night, per person...), a GST note, what is included and a few details; each
**offer** is a time-limited promotion with an end date. Switched-off offerings and expired offers are never mentioned. It also finishes the F06 rule
"share out new leads by offering".

## Where it sits (owner question, 12 Nov 2026)
Offerings are part of the **Phase 1 lead engine**: the AI agent only **states** them (a "from" price with its GST note, what is included, never a total).
The module is `core.offerings` (a shared core module, always on), not part of the leads module, because the **Phase 2 sales engine extends the same
offerings** (exact prices worked out in code, rate tables per date, availability, quotes, bookings) instead of creating a second product list. Nothing
in F17 may be built in a way that would force a second list later.

## What the owner sees (later, when the screens arrive)
Knowledge base → **Offerings**: a list with name, from-price, unit, GST note and an on/off switch; add, edit, drag to reorder, remove (asks "Are you
sure?"). Each offering opens a form. Below it, **Offers**: text and end date. A lead can be tagged with the offering it is about, and new leads can
go to the person who looks after that offering.

## Questions for the owner (my default in bold)
1. **GST: per offering or for the whole business?** The F16 question C2 ("Do your prices include GST?") is one answer for the business, but the
   requirement also puts a GST mode on every offering. **Each offering carries its own GST mode (included, plus GST, no GST); the AI uses the offering's
   own. C2 then becomes "answered in Offerings" like C1, so the same fact is never in two places.** The alternative keeps C2 as a business-wide answer.
2. **Is a price required?** **No. A price is optional.** An offering with no "from" price (the requirement's "we don't share prices") is described without
   a price and the AI says the team will confirm. To go live a business needs **at least one active offering**.
3. **Sharing out new leads by offering, in this feature?** The plan says F17 finishes it. **Yes, as the last slices: every offering may name the person who
   looks after it; a lead may name the offering it is about; the sharing-out rule gets a third mode, "by offering", with one named fallback person for
   leads that name no offering or an offering nobody looks after.** The alternative is to leave it for F02 (teams).
4. **Do offers need an end date?** **Yes, the end date is required** (the requirement says "current offers with end dates"). It counts through the end
   of that day in the business's time zone. A promotion with no end can simply be an offering, or be switched off or removed.
5. **The "extra details" of an offering.** The requirement says a few extra details. **Up to 10 label and value pairs** ("Check-in" / "2 PM", "Max guests" /
   "4"), each short, kept as a list the AI reads as is. The alternative is one free text.

Not in F17: the offering **photo** (uploads arrive with F18), reading offerings **from a website or rate card** (F31 and F18), and the AI's `list_offerings`
tool (F19). The pure function that decides what the AI may see is built and tested now, so F19 only has to call it.

## Scope
- In: tables `offerings` and `offers`; the routes below; a pure "money in words" function ("from ₹4,500 a night plus GST") and a pure "what the AI may
  see" function (active offerings in order, current offers only, in the business's time zone); `leads.offering_id` and the sharing-out mode
  "by offering"; the link to F16 (the `offerings`, `current_offers` and `prices_include_gst` questions are answered by this data, so the completeness score
  and the go-live check count them); activity-log lines and events; isolation entries; the team journey grows a chapter.
- Out: photos, importing from a website or rate card, the AI tool, quotes and exact prices (Phase 2), seasonal price tables (a season note in words only,
  as the requirement says), the screens (designer).

## Rules (proposed)
- An offering: `name` (1 to 120), `description` (up to 1000), `fromPricePaise` (whole paise, 0 to 100,000,000,000, optional), `priceUnit` (per night, per
  person, per package, per visit, per hour, per item, or "Other" with words), `gstMode` (`included`, `plus`, `none`; needed when there is a price, else
  null), `seasonNote` (words, up to 300), `includes` (up to 500), `details` (up to 10 label and value pairs), `active`, `sort`, optional `ownerUserId`.
  Names are unique per business, ignoring capitals, among live offerings.
- The AI states prices only as "from" prices with their GST note; **it never works out a total or adds GST** (the pure function never multiplies anything).
- An offering that is off is never mentioned; neither is an offer past its end date; a removed one is gone for everyone but history. Removing is a soft
  delete (a lead may point at the offering), switching off is the usual way to hide one.
- An offer: `text` (1 to 300) and `endsOn` (a plain date, required). Current = today in the business's time zone is on or before `endsOn`. Expiry is
  worked out when read, not by a job, so it can never be a day late.
- Only managers add, change, reorder and remove; staff read (like leads' settings). The business always comes from the session; the owner of an offering
  must work for the same business (composite foreign key, as for leads).
- Reorder takes the ids of **all** live offerings in the new order (as for pipeline stages); anything else is 400.
- Money is in paise everywhere; the log and events carry ids and field names only, never names, descriptions or prices.

## API (at most 2 routes per slice)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| GET | `/offerings` | Staff | The list in order, with on/off; `?active=true` for the active ones only |
| POST | `/offerings` | Manager | Add |
| PATCH | `/offerings/{id}` | Manager | Edit, switch on or off, name the person who looks after it |
| POST | `/offerings/reorder` | Manager | The new order |
| DELETE | `/offerings/{id}` | Manager | Soft delete |
| GET | `/offers` | Staff | The current ones by default; `?include=expired` for all |
| POST | `/offers` | Manager | Add |
| PATCH | `/offers/{id}` | Manager | Edit |
| DELETE | `/offers/{id}` | Manager | Soft delete |
| PUT | `/assignment-rules` | Manager | Existing route: gains `{"mode":"by_offering","fallbackUserId":"..."}` |
| POST, PATCH | `/leads`, `/leads/{id}` | Staff | Existing routes: gain an optional `offeringId` |

`GET /business`, `GET /business/completeness` and `POST /business/fill-from-website` in `API.md` are covered by F16 (`/knowledge/questions`, whose
answer already carries the progress) and F31 (reading a website); they are not built here.

## Database (migration `017_offerings.sql`, and `018` for the leads link)
- `offerings` (soft delete, actor stamps, composite foreign key on `(account_id, owner_user_id)`, partial unique name index, checks on prices and lengths,
  RLS forced, the app role cannot delete) and `offers` (same shape, `ends_on date`).
- `018`: `leads.offering_id` (composite foreign key to offerings so a lead can only point at its own business's offering) and `assignment_rules` gains the mode
  `by_offering` and `fallback_user_id`.

## Slice plan (each at most 2 routes; you test each in Postman before the next)
| Slice | What | Routes |
| --- | --- | --- |
| 0 | Migration `017`, table types, shared words and shapes, the pure functions (money in words, offer is current, what the AI may see) with unit tests, empty `core.offerings` module | none; **built, owner review pending** |
| 1 | Add an offering, list offerings | `POST /offerings`, `GET /offerings`; **built, owner test pending** |
| 2 | Edit (and switch on or off), remove | `PATCH /offerings/{id}`, `DELETE /offerings/{id}` |
| 3 | Reorder; add an offer | `POST /offerings/reorder`, `POST /offers` |
| 4 | List and edit offers | `GET /offers`, `PATCH /offers/{id}` |
| 5 | Remove an offer; the link to F16 (the questions answered by this data, completeness and go-live count them) | `DELETE /offers/{id}` |
| 6 | Leads name an offering (migration `018`); the sharing-out mode "by offering" | `POST /leads`, `PATCH /leads/{id}` and `PUT /assignment-rules` change (no new addresses) |
| 7 | The team journey grows a chapter, isolation entries, consistency rules, `api-security` review, Postman collection, hand-off | none |

## Slice 1 notes
- `POST /offerings` (manager) needs only a `name`. A price comes with its unit and GST note, or none of the three (400 otherwise). The offering is added at the
  **end of the list**, switched on unless `active: false`. A name that a live offering already has (ignoring capitals) is 409 `OFFERING_EXISTS`, naming it; more than
  200 offerings is 409 `OFFERING_LIMIT`; an owner from another business is 404. The answer includes `priceInWords`, the sentence the AI will use ("from ₹4,500 a night plus GST").
- `GET /offerings` (everyone signed in) lists the business's live offerings in order; `?active=true` or `?active=false` narrows it.
- Adding takes a per-business advisory lock before it works out the next position, so eight simultaneous adds get eight different positions and eight simultaneous adds
  of one name make one offering (both tested).
- The log line holds field names only and the event holds the id and `active`: no names, descriptions or prices (tested).
- Postman: collection *Toobler One - F17 offerings and offers (run in order)* with a random tag in the names, so reruns never clash. Offerings cannot be removed until slice 2.

## Reused from the hotel agent
The "Port from" table has no row for F17. The old agent has hotel-specific tables (`hotel_room_types` with a base price, weekend price and rate overrides per
date range, inventory by room, `hotel_offers` linked to room types). That is a booking and availability model for a later phase (Phase 2: exact prices,
quotes, availability). Nothing is ported; what is reused is the idea of an offer that points at what it applies to and ends on a date.

## Tests (planned)
- Unit: money in words for every unit and GST mode (never a total); "offer is current" at the edges (the last day, midnight in the business's zone, a zone
  ahead of UTC); "what the AI may see" drops off, expired and removed items and keeps the order.
- API, every route: works / 401 / 403 (wrong role) / 404 (another business's id, an owner from another business) / 400.
- Specific: duplicate names (ignoring capitals) are 409; reorder needs every live offering; removing keeps leads that point at the offering; the log and
  events hold no names or prices; the offering a lead names must be its own business's; "by offering" gives the lead to the offering's person, else the
  fallback; a simultaneous add of the same name makes one offering.
- Consistency checker: no two live offerings with the same name; an offering's owner and a lead's offering belong to the same business; a price has a GST
  mode; an offer has an end date; nothing dangling.
- Isolation: an entry for every route in `test/isolation.test.ts` (it fails if one is missing); the team journey gains a chapter.

## Known limits to watch (R39 to R46)
R39 (disabled owners) also applies to an offering's owner until F02. R46 (a deleted contact's open lead) is unrelated. R44 (npm audit) is checked at the start.

## Security checklist (to fill in at hand-off)
