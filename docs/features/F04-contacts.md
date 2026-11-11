# F04: Contacts

**Requirements:** `2-crm-core/01-contacts.md`; docs/plan/PHASE-1.md (F04)
**Depends on:** F00, F01      **Module:** `core.contacts` (core: always on, no switch)

**Goal in one line:** one record per person the business deals with, found by phone number from any country, so every later
feature (leads, tickets, conversations, tasks) hangs off one contact.

## Owner decisions (11 Nov 2026)
1. **Match on the full international number**, not the last 10 digits (R35 in REQUIREMENTS-REVIEW.md). A number typed without a
   country code gets the business's default country (India until F16 adds the setting).
2. **`libphonenumber-js` 1.13.15** parses numbers (vetted: 41 M downloads a week, MIT, no install script).
3. A new **`kernel/phone.ts`** serves contacts. F01's `auth/helpers/phone.ts` and `users.mobile_key` are **unchanged** (F01 is
   approved); switching auth to the library is an optional later follow-up.
4. **Only managers delete**; staff add and edit. The "own contacts only" role (`staff_own`) comes with F02/F11.
5. **Left out for now** (each is one small migration when its feature arrives): `company_id` (F05), `custom` fields (F09), notes
   (F07), and **`owner_user_id` (F02, needs the team and a same-business check)**.
6. A contact needs **a phone or an email**; a name is optional (the AI never guesses a name).

## Scope
- In: the `contacts` table; `POST /contacts`, `GET /contacts` (search, filter, page), `GET /contacts/{id}`, `PATCH /contacts/{id}`,
  `DELETE /contacts/{id}` (soft); phone rules; the lifecycle rules as a pure function; activity log and events.
- Out: the screens (on hold for the designer), companies, custom fields, notes, timeline, duplicates (F13), import (F12), the
  agent's lookup (F19), the automatic lifecycle stages (F06 computes `lead`, `customer`, `repeat_customer`).

## Rules
- Phone: any format → E.164 (`+919847012345`). Possible numbers are accepted, impossible ones refused (400 `INVALID_PHONE`),
  extensions refused. The matching key `phone_key` is the E.164 digits and is a **generated column**, so it can never drift.
- Email: trimmed and lower-cased; an empty string means "none".
- Unique per business among contacts that are not deleted: `phone_key` and `email`. A duplicate answers **409 `CONTACT_EXISTS`**
  with only `{ contactId }` of the existing contact. If a phone and an email match two different contacts, the phone match is
  named. Two requests at the same moment cannot both win (the database decides).
- Soft delete: `deleted_at` is set, nothing is removed; the app role cannot hard-delete. A deleted contact's phone and email can
  be used again by a new contact.
- Staff can only mark or unmark `not_a_fit`; every other lifecycle stage is computed (from F06). New contacts are `new`.
- Every change records who made it. Activity-log lines and events carry **ids and field names only**, never a phone or email.
- Another business's id answers 404.

## Slices (at most 2 routes each)
| Slice | Routes | State |
| --- | --- | --- |
| 1 | `POST /contacts`, `GET /contacts` | built and committed |
| 2 | `GET /contacts/{id}`, `PATCH /contacts/{id}` | done and tested by the owner |
| 3 | `DELETE /contacts/{id}` | built; owner test pending |
| Journey | chained story test (`contacts-journeys.test.ts`) | done |
| UI | Contacts list, contact page, add/edit, delete | on hold (designer) |

## Reused from the hotel agent
- Read: `src/modules/core/customers/{service,routes,repository}.js` (120 lines).
- **Reused:** find a person by phone; escaped text search over name, phone and email; a paginated list; create-or-find that is
  safe when two requests arrive at once.
- **Changed:** guests tied to bookings become generic contacts for every industry; worldwide phone matching; duplicates answer
  with the existing contact; soft delete, lifecycle stage and actor stamps; our module shape and the account fence.
- **Left behind:** booking statistics, the VIP flag, notes.

## Database (migration `009_contacts.sql`, final before it is applied)
`contacts` (fenced by `account_id`, RLS forced): `id`, `account_id`, `name`, `phone` (E.164), `phone_key` (generated), `email`,
`language`, `lifecycle_stage`, `deleted_at`, `created_by`, `updated_by`, `created_at`, `updated_at`. Checks: a phone or an email is
present; `email = lower(email)`; the stage is one of five values. Partial unique indexes on `(account_id, phone_key)` and
`(account_id, email)` where not deleted. The app role has no `DELETE` and may update only the editable columns.

## API (under `/api/v1`)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| POST | `/contacts` | Staff | `{ name?, phone?, email?, language? }`; 201 with the contact; 409 `CONTACT_EXISTS`; 400 `INVALID_PHONE` |
| GET | `/contacts` | Staff | `q` (name, email, phone digits), `lifecycleStage`, `page`, `limit` (max 100); `{ items, total, page, limit }` |

## Manual test, slice 1 (Postman or the Swagger page at `/docs`; sign in first; send `Origin: http://localhost:3000` and `X-Requested-With: toobler-web` on the POST)
| # | Request | Expect |
| --- | --- | --- |
| 1 | `POST /contacts` `{"name":"Priya Menon","phone":"098470 12345","email":"Priya@Example.com"}` | 201; phone `+919847012345`, email lower-cased, `lifecycleStage` `new` |
| 2 | `POST /contacts` `{"name":"Someone","phone":"+91 98470-12345"}` | 409 `CONTACT_EXISTS` with `details.contactId` = Priya's id |
| 3 | The same with `9847012345`, then `0091 98470 12345` | 409 both times |
| 4 | `POST /contacts` `{"email":"priya@example.com"}` | 409 (same email, any letter case) |
| 5 | `POST /contacts` `{"name":"Rahul","phone":"+44 7700 900123"}` | 201, `+447700900123` (other countries work) |
| 6 | `POST /contacts` `{"name":"No way to reach"}` | 400 `PHONE_OR_EMAIL_REQUIRED` |
| 7 | `POST /contacts` `{"phone":"abc"}` and `{"phone":"98470 12345 x123"}` | 400 `INVALID_PHONE` |
| 8 | `POST /contacts` `{"phone":"+971501234567","lifecycleStage":"customer"}` | 400 (unknown field) |
| 9 | `GET /contacts` | 200, `items` newest first, `total`, `page`, `limit` |
| 10 | `GET /contacts?q=priya`, `?q=98470`, `?q=098470 12345`, `?q=%25` | Priya found for the first three; `%` matches nothing odd |
| 11 | `GET /contacts?limit=500`, `?page=0` | 400 |
| 12 | Any contacts route without the cookie | 401 |


## Manual test, slice 2 (use the `id` of a contact from slice 1; send the two headers on the PATCH)
| # | Request | Expect |
| --- | --- | --- |
| 1 | `GET /contacts/<id>` | 200, the contact |
| 2 | `GET /contacts/<a random uuid>` and `GET /contacts/abc` | 404, then 400 |
| 3 | `PATCH /contacts/<id>` `{"name":"Priya M","language":"ML"}` | 200; name changed, language `ml`; phone and email as before |
| 4 | `PATCH` `{"phone":"0484 2345678"}` | 200; phone `+914842345678` |
| 5 | `PATCH` with another contact's phone (any format) | 409 `CONTACT_EXISTS` with that contact's id |
| 6 | `PATCH` `{"name":null}` | 200; name is null |
| 7 | `PATCH` `{"phone":null,"email":null}` on a contact with both | 400 `PHONE_OR_EMAIL_REQUIRED`; nothing changed |
| 8 | `PATCH` `{}` | 400 `NOTHING_TO_CHANGE` |
| 9 | `PATCH` `{"lifecycleStage":"customer"}` | 400 (staff cannot set the stage) |
| 10 | `PATCH` `{"notAFit":true}`, then `{"notAFit":false}` | stage `not_a_fit`, then `new` |
| 11 | `PATCH` or `GET` another business's contact id, or without the cookie | 404, 401 |

## Manual test, slice 3 (managers only; send the two headers)
| # | Request | Expect |
| --- | --- | --- |
| 1 | `DELETE /contacts/<id>` as a manager | 204, no body |
| 2 | `GET /contacts/<id>` and `GET /contacts` | 404 for the contact; it is gone from the list |
| 3 | `PATCH /contacts/<id>` | 404 |
| 4 | `DELETE /contacts/<id>` again | 404 |
| 5 | `POST /contacts` with the deleted contact's phone or email | 201: the number is free again |
| 6 | `DELETE` a random uuid, `abc`, and another business's contact id | 404, 400, 404 |
| 7 | `DELETE` as ordinary staff (change a test user's role to `staff` in the database) | 403 |
| 8 | `DELETE` without the cookie | 401 |

The contact's row stays in the database with `deleted_at` set (check in the Supabase table editor). There is no restore
route and no erase-personal-data step in F04 (decided; see the review log).
