# F17: Offerings and offers

**Requirements:** `3-ai-agents-and-channels/01-business-info-and-offerings.md`; `requirements/API.md` (Business info and offerings); `2-crm-core/03-leads-and-pipeline-board.md` ("sharing out new leads: by offering"); docs/plan/PHASE-1.md (F17)
**Depends on:** F00, F01, F04, F06, F16      **Module:** `core.offerings` (core: always on, no switch)
**Status:** in review (12 Nov 2026). Slices 0 to 7 are built. The owner lifted the "one slice at a time" rule for slices 6 and 7 (built together) and asked for the full verification and the merge into `dev`; the owner's "approved" is still to come after the Postman test.

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
| 2 | Edit (and switch on or off), remove | `PATCH /offerings/{id}`, `DELETE /offerings/{id}`; **built, owner test pending** |
| 3 | Reorder; add an offer | `POST /offerings/reorder`, `POST /offers`; **built, owner test pending** |
| 4 | List and edit offers | `GET /offers`, `PATCH /offers/{id}`; **built, owner test pending** |
| 5 | Remove an offer; the link to F16 (the questions answered by this data, completeness and go-live count them) | `DELETE /offers/{id}`; **built, owner test pending** |
| 6 | Leads name an offering (migration `018`); the sharing-out mode "by offering" | `POST /leads`, `PATCH /leads/{id}` and `PUT /assignment-rules` change (no new addresses); built with slice 7 |
| 7 | The team journey grows a chapter, isolation entries, consistency rules, `api-security` review, Postman collection, hand-off | none; built, full verification run |

## Slice 1 notes
- `POST /offerings` (manager) needs only a `name`. A price comes with its unit and GST note, or none of the three (400 otherwise). The offering is added at the
  **end of the list**, switched on unless `active: false`. A name that a live offering already has (ignoring capitals) is 409 `OFFERING_EXISTS`, naming it; more than
  200 offerings is 409 `OFFERING_LIMIT`; an owner from another business is 404. The answer includes `priceInWords`, the sentence the AI will use ("from ₹4,500 a night plus GST").
- `GET /offerings` (everyone signed in) lists the business's live offerings in order; `?active=true` or `?active=false` narrows it.
- Adding takes a per-business advisory lock before it works out the next position, so eight simultaneous adds get eight different positions and eight simultaneous adds
  of one name make one offering (both tested).
- The log line holds field names only and the event holds the id and `active`: no names, descriptions or prices (tested).
- Postman: collection *Toobler One - F17 offerings and offers (run in order)* with a random tag in the names, so reruns never clash. Offerings cannot be removed until slice 2.

## Slice 2 notes
- `PATCH /offerings/{id}` (manager): only the fields sent change; the values it already has change nothing and write no log line; `{}` is 400 `NOTHING_TO_CHANGE`.
  **The price moves as one piece:** `fromPricePaise: null` takes the price, its unit and its GST note away together; changing just the number keeps the unit and GST
  note; adding a price to an offering that has none must send all three; anything that would leave a price half described is 400 `INCOMPLETE_PRICE`. `details` replaces
  the whole list, `active` switches an offering on or off (an off offering can still be edited), `ownerUserId: null` takes the person away. A name another live
  offering has is 409 `OFFERING_EXISTS` (changing the capitals of its own name is fine). Two managers changing different fields of one offering at the same moment keep
  both changes (row lock; tested). The position has its own route (reorder, slice 3), so `sort` is refused.
- `DELETE /offerings/{id}` (manager) is a **soft delete** (204): gone from every list, row kept (a lead may point at it in slice 6), name free to use again, the app role still
  cannot really delete a row (tested). Positions are not renumbered after a removal; the reorder route (slice 3) tidies them.
- Log lines (`offerings.updated`, `offerings.deleted`) hold field names and ids only; events (`offering.updated`, `offering.deleted`) hold ids and field names.
- Postman: folders 3 (change) and 4 (remove, and clean up everything the run added with a script).

## Slice 3 notes
- `POST /offerings/reorder` (manager) takes `{ "offeringIds": [...] }`: **every live offering of the business (on and off) exactly once**, in the new order, or 400
  `OFFERINGS_MISMATCH` (a missing, repeated, removed, unknown or other business's id). Positions become 0, 1, 2... with no gaps, so it also tidies the gaps removals leave.
  The same order sent again writes nothing. It shares the per-business lock with adding, so a reorder and an add never read the same list. The route is declared before
  `/offerings/{id}`, so "reorder" is never mistaken for an id. Log line `offerings.reordered` (field `order`) and event `offerings.reordered` (a count): no names.
- `POST /offers` (manager) takes `{ "text", "endsOn" }`. `endsOn` is a real plain date and must be **today or later in the business's time zone** (400 `OFFER_ALREADY_ENDED`),
  because an offer that has ended is never shown to anyone. At most 200 live offers (409 `OFFER_LIMIT`). The answer has `current`, worked out when read in the business's
  time zone. Log line `offers.created` (field names) and event `offer.created` (id and end date, never the words).
- `calendarDateSchema` (a real date like 2026-12-31) moved from being private to `packages/shared/src/leads.ts` to exported, so offers reuse leads' date check.

## Slice 4 notes
- `GET /offers` (everyone signed in) shows the offers that are **still on today in the business's time zone**, the ones ending soonest first; `?include=expired` adds the ended ones
  (each says `current: false`). Removed offers never appear. "Still on" is worked out when the list is read, never by a job.
- `PATCH /offers/{id}` (manager) changes the words and/or the last day. A new last day must be today or later (400 `OFFER_ALREADY_ENDED`), which is also how an ended
  offer is brought back; the words of an ended offer can be edited without touching its last day. `{}` is 400 `NOTHING_TO_CHANGE`; the values it already has change nothing and write
  no log line; two managers changing different fields at once keep both changes. Log line `offers.updated` (field names) and event `offer.updated` (id and field names).

## Slice 5 notes
- `DELETE /offers/{id}` (manager): a soft delete (204); gone from every list, even with `include=expired`; a second delete, an unknown id and another business's offer are 404; the
  app role still cannot really delete a row. Log line `offers.deleted` and event `offer.deleted` hold ids only.
- **The link to the business profile (F16), as the owner chose (question 1):**
  - "What do you sell?" (`offerings`) is now **counted and answered by the data**: it is answered exactly when the business has at least one offering that is switched on. It is still
    needed to go live, so **a business cannot be `readyToGoLive` without an offering that is on.** `GET /knowledge/questions` shows it with `elsewhereStatus: done | not_done` (and
    `not_tracked` for the questions whose feature does not report yet: FAQs, documents). The total number of counted questions is unchanged (one question came in, one went out).
  - The GST question (`prices_include_gst`) is now **"answered in Offerings"** (each offering carries its own GST note), so `PUT /knowledge/answers/prices_include_gst` is 400
    with "answered in offerings". An older answer to it, if a test business has one, is simply no longer shown as a profile answer that counts.
  - "Do you have any offers running now?" (`current_offers`) stays **left out of the score**: having no offers is normal, so it can never be "unanswered".
  - How: `core.knowledge` now `requires` `core.offerings` and asks it, through `index.ts`, how many offerings are on (`countActiveOfferingsOfBusiness`, run in the same fenced
    transaction). The pure `computeProfileProgress` takes a map of "answered elsewhere" facts; it never reads a table.
  - This changed earlier tests on purpose (the F16 ones that expected `readyToGoLive` after seven answers, and the GST answer), and the F16 Postman requests were updated to match.
- The F16 Postman collection: "Pick one: do prices include GST?" became "about how many enquiries a month?", and the two go-live checks now allow only an offering to be missing.

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

## Slice 6 notes: leads about an offering, and sharing out by offering
- **Migration `018`:** `leads.offering_id` with a composite foreign key to `offerings (account_id, id)` (a lead can only point at its own business's offering; the app role
  gets column grants to set and change it), and the rule mode `by_offering`. The fallback person is kept in the rule's existing `user_id` column (the same idea as
  `one_person`), and a new database check says a rule other than round-robin always names its person.
- `POST /leads` and `PATCH /leads/{id}` take an optional `offeringId` (`null` on PATCH takes it away). It must be an offering of the business that is not removed (a switched-off one is
  fine), otherwise 404. **Naming or changing the offering never hands the lead to someone else.** Every lead answer has `offering: { id, name } | null`; the name stays on the lead even if the
  offering is removed later. `GET /leads?offeringId=...` lists the leads about one offering (the board honours it too; the "own leads only" person still sees only theirs).
- `PUT /assignment-rules` takes a third shape, `{ "mode": "by_offering", "fallbackUserId": "..." }`. A new lead goes to: the person named in the request, else (in this mode) **the person who
  looks after the lead's offering, else the fallback person**. The "own leads only" role still gets only its own leads. `GET /assignment-rules` answers `fallbackUserId` (and `userId` null) in this mode.
  A fallback person from another business or an unknown one is 404, and none is 400. One person, round-robin and by-offering never interfere with each other (tested).
- **How the modules talk:** `core.leads` now `requires` `core.offerings` and reaches it only through its `index.ts` (`findOfferingForLead`, `findOfferingSummaries`); `core.offerings` requires nothing,
  so there is no loop. The offering lookup runs in the same fenced transaction as the lead.

## Slice 7 notes: the safety net
- `test/support/consistency.ts` gained the rule **"offerings and offers are in order"**: no two live offerings with one name or one position, no half-described price, at most 10 details, no offering owner or
  lead offering from another business, a non-round-robin sharing rule always names its person. Offerings and offers join "every creation is logged and announced exactly once" and "every stamp names someone of
  the business", and the words of offerings and offers are scanned for in the log and events (we promised ids and field names only). Three new "damage" cases prove the checker notices them.
- The team journey has a new chapter (5b): the business switches to sharing out by offering and the leads go to the offering's person, the other offering's person, and the fallback.
- `test/isolation.test.ts` has an attempt for every new route and for the three changed ones (a lead about another business's offering, B's lead pointed at it, a fallback person from another business).

## Security checklist
Reviewed with the `api-security` skill on 12 Nov 2026 (the whole F17 diff: 9 new routes, 3 changed routes, 2 tables, migrations 017 and 018, and the knowledge and leads changes).

- [x] Every new table has account_id, RLS enabled + forced, and the schema test passes (`offerings`, `offers`). `leads` gained a column; the app role has column grants only.
- [x] Every new route: role guard (reads `staff`, every write `manager`) and tests for works / 401 / 403 wrong role (including the "own leads only" role) / 404 other business / 400 bad input.
- [x] staff_own: offerings and offers are business-wide for every role to read (they are what the AI says to customers). The leads changes keep the "own leads only" filter (tested).
- [x] No business id taken from body, query or params; the business and its time zone come from the session; every body is `.strict()`; positions, removal state and the creator can never be sent.
- [x] All input validated with zod with maximum lengths; money is whole paise; dates are real dates; the offerings module has one fixed raw SQL (the advisory lock) and one bound `lower(name)` comparison; no SQL is built from strings.
- [x] No public route, webhook, tool, outside call or upload added.
- [x] Nothing personal in the log or events: only ids, field names and the end date of an offer; the consistency checker scans the whole log for the names, descriptions and offer words.
- [x] The AI can read only what `selectWhatTheAgentMaySee` returns: off, removed and ended items never reach it (unit-tested); prices are only "from" prices in words, never a total.
- [x] Cross-module access only through `index.ts`: knowledge and leads call offerings; offerings calls nothing. No requires loop.
- [x] Simultaneous requests: adding and reordering take a per-business lock; row locks serialise edits; tested with `Promise.all`.
- [x] `process.env` is read only in `kernel/config.ts`; `npm audit --audit-level=high` shows no high or critical finding (10 moderate, as before F17; F17 adds no package).
- [x] Full verification (gate, format, lint, typecheck, all tests, browser tests): see the hand-off message.

Known limits (tracked in docs/REQUIREMENTS-REVIEW.md R39 to R46): a disabled person can still be an offering's owner or the fallback person (R39, arrives with F02); R42 and R46 are not touched by F17.
Not built, by design: the offering photo (F18 uploads), reading offerings from a website or rate card (F31), the AI's `list_offerings` tool (F19; its pure data function is ready), exact prices and quotes (Phase 2).

## Decisions and differences from the requirements
- Owner defaults (12 Nov 2026): each offering carries its own GST mode; a price is optional; sharing out by offering is in F17; an offer's end date is required; details are up to 10 label/value pairs.
- `core.offerings` is a shared core module: the Phase 2 sales engine extends the same offerings instead of creating a second product list.
- The F16 profile changed with it: "What do you sell?" counts when an offering is on, and the GST question is answered per offering (see slice 5).
- `API.md` lists `GET /business`, `GET /business/completeness` and `POST /business/fill-from-website`: covered by F16 (`/knowledge/questions`) and F31, not built here.

## Manual test script
The screens are parked for the designer, so F17 is tested through the API.

**A. Postman (recommended).** Collection *Toobler One - F17 offerings and offers (run in order)* and environment *Toobler One - local dev* (a verified **manager**).
1. `npm run db:migrate` (017 and 018 must be applied), restart `npm run dev`.
2. Run the collection with the Runner, folders 0 to 10 in order. Every request checks its answer; all must pass. The folders clean up after themselves, except the two offers folder 6 adds (offers
   end by themselves; folder 8 removes one). Folder 10 puts the sharing rule back to "every new lead goes to me".
3. Also run the F16 collection once more: its checks were updated for the new go-live rule.

**B. By hand, the main path.**
1. `POST /offerings` `{"name":"Family room","fromPricePaise":450000,"priceUnit":"per night","gstMode":"plus"}` → 201, `priceInWords: "from ₹4,500 a night plus GST"`. Add one with no price, and one with `"active":false`.
2. `GET /offerings` in order; `?active=true` hides the one that is off. `PATCH` a name, the price (only the number), `{"fromPricePaise":null}` to take the whole price away. `POST /offerings/reorder` with all ids.
3. `DELETE` one: gone from the list, its name free again. Duplicate name (any capitals): 409.
4. `POST /offers` `{"text":"10 percent off","endsOn":"<a date 30 days away>"}`; an old date → 400 `OFFER_ALREADY_ENDED`; `GET /offers` lists it; `PATCH` it; `DELETE` it.
5. `GET /knowledge/questions`: "What do you sell?" says `elsewhereStatus: done` while an offering is on, and `readyToGoLive` needs it.
6. `POST /leads` with `offeringId`: the lead shows `offering.name`; `GET /leads?offeringId=...` lists it. `PATCH /leads/{id}` `{"offeringId":null}` clears it.
7. `PUT /assignment-rules` `{"mode":"by_offering","fallbackUserId":"<you>"}`; name an offering's owner with `PATCH /offerings/{id}` `{"ownerUserId":"..."}` and add leads about it. Put the rule back.
8. As **staff**: every offering, offer and rule write is 403, every read is 200. Signed out: 401.

**C. The whole story:** `npx vitest run team-journey isolation leads-offerings` shows the busy day with offerings and sharing out by offering, and the database checked afterwards.
