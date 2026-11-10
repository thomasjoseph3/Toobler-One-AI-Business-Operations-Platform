# F01: Sign-up, sign-in and sessions

**Requirements:** `5-onboarding-and-launch/02-sign-up-and-sign-in.md`; docs/SECURITY.md §2.2; docs/BACKEND.md §2
**Depends on:** F00      **Module:** `core.auth` (core)

**Goal in one line:** a business owner can create an account alone, prove their email, sign in again later
(email and password), and land in the app *as a member of their business*, so everything built after this
(contacts, knowledge base, AI agent) is saved for the right business and shown only to the right people.

**Owner decisions (10 Nov 2026):** (1) sign-in uses a short-lived **access token plus a rotating refresh token**;
(2) **one email manages one business** for now: no second business, no switching; (3) **email only for now**: no mobile
verification and no code sign-in, because there is no OTP service yet. The mobile number is still collected (the AI agent
and WhatsApp will need it) but it is not verified. The design keeps (2) and (3) easy to widen later.

## Scope
- In:
  - Sign-up: name, business name, email, mobile (kept, not verified), password, industry. Creates the business and the
    owner (role `manager`), and signs them in.
  - Verify email (link, 48 h). The app is not usable until the email is verified.
  - Sign-in with email + password. Forgot / reset password by email (link, 1 h).
  - Access token (15 min) + refresh token (rotating), both in httpOnly cookies set by the API; refresh, sign out, sign
    out everywhere (on password change or reset).
  - `GET /me`, `PATCH /me` (name), change password.
  - Lockout, rate limits, CSRF protection, the real `authenticate` that fills `request.principal`, and `RequestContext`
    (the `AccountContext` plus the signed-in person) for later features.
  - Mail provider behind an interface: `smtp` (nodemailer, using the `SMTP_*` and `EMAIL_FROM` settings already in your
    `.env`) and `console` (prints the link to the API log when no SMTP is configured). Automated tests send to Mailpit in Docker.
  - Industry is chosen from a list that lives in the database (`industries`, seeded; `GET /api/v1/industries`) and stored on
    the business; only the "general" preset exists for now (stages, fields and words arrive with F16/F31). Adding an
    industry (a platform-only `POST`) comes after sign-in exists.
- Out (later feature): a person in several businesses, switching business, "add another business" (owner's decision:
  later; it becomes a `memberships` table then); inviting staff and the roles screens (F02); module switches and the menu
  coming from `/me` (F03); mobile verification and WhatsApp-code sign-in (they arrive with F25, when an OTP/WhatsApp provider exists); platform admin login and support access (F03/F24); changing
  email or mobile (after F02); single sign-on and two-factor (not in Phase 1).

## Reused from the hotel agent
- Read: `src/modules/core/auth/{routes,service,sessions,repository}.js`, `src/middleware/auth.js` (489 lines). **We keep
  what serves our goal and change what doesn't.**
- **Reused (ported to TypeScript):**
  - The token design: a signed **access token (JWT, 15 min)** naming the user and the session, and a **random refresh
    token stored only as a hash**, **replaced at every refresh**. A replaced token used again after a one-minute
    grace (two requests refreshing at once) means a copy was stolen, so the session ends.
  - Every API call also checks the session is still live in the database, so signing out, a password change or
    disabling a person stops their access at once, even within the 15 minutes.
  - The same answer and timing for an unknown email and a wrong password (a dummy hash is checked); login limits per
    email+address and per address; ending a person's *other* sessions on a password change; keeping ended sessions 90
    days ("who signed in from where"), then deleting them; never logging the query string.
- **Changed, and why:**
  - *Old:* the tokens were kept in cookies by a **Next.js server** in front of the API. *New:* there is no Next.js; the
    **API sets the httpOnly cookies itself** (access cookie for `/api`, refresh cookie only for `/api/v1/auth/refresh`),
    and the React app calls the API at the same address. Tokens never reach browser JavaScript. We add a CSRF check
    (Origin + a custom header) that the old setup didn't need.
  - *Old:* only a platform admin could create users. *New:* owners sign up alone, with email verification.
  - *Old:* bcrypt (`bcryptjs`) and `jsonwebtoken`. *New:* argon2id (`@node-rs/argon2`, no install script) and `jose` (no dependencies).
  - *Old:* a list of businesses in a column of the user. *New:* the person belongs to **one** business through
    `users.account_id` (fenced like every other business table), so the later Team screen (F02) is a plain fenced query.
  - *Old:* a platform "super admin" role mixed with business roles. *New:* business roles only here; platform people arrive with F03/F35.
  - Added (not in the old code): email verification, forgot/reset password, the CSRF check.
- **Left behind:** MCP client sessions (F30), support-access visits (F24), the hotel wording.

## Database (migration `002_auth.sql`)
Credentials and login state sit in **global** tables that the app role (`app_user`) cannot touch at all; they are reached
only through named functions in `kernel/database/across-accounts.ts` (each with a comment saying why). Profile data sits in
**fenced** tables like everything else.

| Table | Fenced? | Purpose | Key columns |
| --- | --- | --- | --- |
| `accounts` | RLS on `id` | The business | `id`, `name`, `industry`, `time_zone` (default Asia/Kolkata), `created_at`. A fenced query sees only its own row. |
| `users` | Yes (`account_id`, RLS forced) | A person in a business | `id`, `account_id`, `email` (lower-cased, **unique across all businesses**), `name`, `mobile_e164` and `mobile_key` (last 10 digits; **not unique and not verified for now**), `role` (manager/staff/staff_own), `email_verified_at`, `status` (active/disabled), `last_login_at`, `created_by`, `updated_by` |
| `user_credentials` | Global | The secret part, apart from the profile | `user_id`, `password_hash` (argon2id), `password_changed_at` |
| `sessions` | Global | One sign-in on one device | `id`, `user_id`, `refresh_token_hash` (unique), `previous_refresh_token_hash`, `rotated_at`, `user_agent`, `ip`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`, `revoked_reason` |
| `auth_tokens` | Global | Single-use links | `kind` (email_verify, password_reset), `user_id`, `secret_hash`, `expires_at`, `used_at`. Long random tokens, stored hashed. (6-digit codes for mobile arrive with F25.) |
| `login_attempts` | Global | Lockout counters | `key_hash` (hash of the email, so unknown accounts behave the same), `failed_count`, `locked_until` |

The schema test's list of global tables gets `user_credentials`, `sessions`, `auth_tokens`, `login_attempts` (each with its
reason) and `accounts` (own RLS on `id`); `users` must pass the RLS check.

Settings (checked in `kernel/config.ts`, names listed in `.env.example`): `JWT_SECRET` (at least 32 characters; production
refuses to start without it or with an example value), `ACCESS_TOKEN_MINUTES` (15), `SESSION_IDLE_DAYS` (7),
`SESSION_MAX_DAYS` (30), `MAIL_PROVIDER` (`smtp` or `console`; default `smtp` when `SMTP_HOST` is set), and the settings your `.env` already has:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. `SMTP_PASS` is a secret: never printed or logged.

## API (all under `/api/v1`)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| POST | `/auth/signup` | Public | Creates business + owner + session; sends the email link. If the email is already registered it says so (sign-up cannot hide that, so it is rate-limited hard: 5 per hour per address). |
| POST | `/auth/verify-email` | Public | `{ token }`; single use. |
| POST | `/auth/resend-email` | Staff (signed in, unverified allowed) | 3 per 15 min. |
| POST | `/auth/login` | Public | Email + password. Lockout after 5 wrong; same message and timing for an unknown email. Sets both cookies. |
| POST | `/auth/refresh` | Public (needs the refresh cookie) | New access + refresh token; a replaced refresh token used again ends the session. |
| POST | `/auth/forgot-password` | Public | Always the same answer; emails a 1 h link if the email exists. |
| POST | `/auth/reset-password` | Public | `{ token, password }`; ends all sessions. |
| POST | `/auth/logout` | Staff | Ends this session, clears both cookies. |
| GET | `/me` | Staff (unverified allowed) | The person, verification state, their business and role. |
| PATCH | `/me` | Staff | Name. |
| POST | `/me/password` | Staff | Current + new password; ends the other sessions. |

Every unsafe request (POST/PATCH/DELETE) must carry an `Origin` equal to our web address and the header
`X-Requested-With: toobler-web`; otherwise 403. Public routes are added to `public-routes.ts`, each with its reason.
An expired access token answers `401` with the code `TOKEN_EXPIRED`, which tells the web app to call `/auth/refresh`
once and repeat the request.

## Screens (`apps/web`, phone first)
- **Sign up:** one card: your name, business name, work email, mobile (kept for the AI agent and WhatsApp), password (show/hide, rules shown as you type), industry.
  Error text under each field; button "Create my account".
- **Verify:** "Check your email" with a resend button (after 30 s), shown until the link is clicked. Reaching the app is
  blocked until then.
- **Sign in:** email and password; "Forgot password?" link; lockout message ("Try again in 15 minutes").
- **Forgot / reset password:** email form, then new password form.
- **Profile** (from the top-bar person menu): name, change password, sign out. The top bar shows the business name.
- Shared pieces: auth layout (centered card, brand mark), `RequireSignIn` wrapper, an API client that refreshes the access
  token once on `TOKEN_EXPIRED` and signs the person out if the refresh fails, `/me` loading state; every form has
  loading, error and success states and keeps what was typed after an error.

## Rules to enforce
- Passwords: at least 10 characters, not on a common-password list, not equal to the email or mobile.
- Access token: JWT (HS256, `jose`), issuer and audience checked, 15 minutes, carries only the user id and session id
  (never the business: that is read from the user's row). Refresh token: random 256 bits, stored as SHA-256 hash, rotated at
  every use; 7 days idle, 30 days maximum. Cookies: `toobler_access` and `toobler_refresh` (`__Host-` prefix in
  production where the path allows), `HttpOnly`, `SameSite=Lax`, `Secure` in production; the refresh cookie is only
  sent to `/api/v1/auth/refresh`.
- Every request checks the session is live and the person active; a password change or reset ends sessions at once.
- Lockout: 5 wrong passwords for the same email locks that key for 15 minutes.
- Unknown email, wrong password and locked account all look the same to the caller.
- One email can't create two accounts, and one email manages one business (a second sign-up with it is refused).
- The business of a request comes **only** from the signed-in person's row, never from the body, query or URL.
- Never log the password, tokens, SMTP password, email or mobile. The console mail provider prints the verification or
  reset link only outside production, and never the address.

## Tests
- **Unit:** password rules; phone normalisation to E.164 and `mobile_key` (+91, 0, spaces, dashes); token
  generation and hashing; lockout counter; token signing and checking (forged, expired, wrong audience or issuer, wrong
  secret all fail); cookie settings per environment.
- **API (every route: works / 401 / 403 / 404 other business / 400 bad input):** sign-up creates the business, owner and
  session; duplicate email refused; lockout after 5 with the 15-minute message; unknown email identical to
  wrong password; email link expiry and single use; **refresh rotates the token, a replaced token reused after the grace ends the
  session, two parallel refreshes both succeed, an expired or revoked session cannot refresh**; reset ends all sessions;
  password change keeps the current session only; idle (7 days) and absolute (30 days) expiry; CSRF (missing/wrong Origin or
  header → 403); `/me` reveals only the caller's data and never a hash; logs contain no secrets; the app role cannot
  read `user_credentials`, `sessions`, `auth_tokens` or `login_attempts`.
- **Isolation:** `users` and `accounts` pass the schema test; a fenced query sees only its own business's people.
- **E2E (Playwright, phone and desktop):** sign up → verify email (link read from Mailpit) → lands in the app; the page keeps working after the access token expires (refresh happens quietly);
  sign out; sign in by password; wrong password ×5 shows the lockout; forgot/reset; signing up
  again with the same email is refused; axe accessibility on every new screen in both themes.

## Manual test script
1. `npm run setup`, then restart your API terminal (it now sends real email through the `SMTP_*` settings in your `.env`).
2. Open http://localhost:3000, you are sent to the sign-in page. Choose **Create an account** and fill the form with an
   email address you can read → you see "Check your email".
3. Open the email, click the verification link → you reach Today, and the top bar shows your business name.
4. In the browser's developer tools, delete the `toobler_access` cookie and click a menu item: the page still works
   (the app refreshed the token quietly; you can see a `/auth/refresh` call in the API log).
5. Sign out from the person menu, then sign in again with your email and password.
6. Enter a wrong password 5 times → "Try again in 15 minutes", and the same message for an email that doesn't exist.
7. Try to create another account with the same email → refused ("already registered").
8. Forgot password → open the email → set a new password → the old password no longer works, and a second browser that
   was signed in is signed out.
9. `npm run verify` is green.

## Security checklist
- [ ] Every new table has account_id, RLS enabled + forced, and the schema test passes (global tables listed with reasons; `app_user` has no access to them)
- [ ] Every new route: role guard on the route; tests for works / 401 / 403 wrong role / 404 other business / 400 bad input
- [ ] Every list, search and export respects staff_own (n/a: no lists yet)
- [ ] No business id taken from body, query, params or tool arguments (the signed-in person's row decides)
- [ ] All input validated with zod, with max lengths; no SQL built from strings
- [ ] New public routes listed in public-routes.ts with a reason, rate-limited
- [ ] New webhook? (n/a)
- [ ] New agent/assistant tool? (n/a)
- [ ] New outside call with a user-given URL? (n/a)
- [ ] New file upload? (n/a)
- [ ] Nothing new logged that is personal data or a secret (log scan test passes)
- [ ] Deletes ask first in the UI; sign-ins, password changes and sign-ups write the activity log
- [ ] Secrets encrypted at rest and shown only as previews (n/a: no stored third-party secrets; tokens and codes are hashed; `JWT_SECRET` only in env)
- [ ] `npm run verify` passes

## Decisions and differences from the requirements
- **Dependencies to add (vetted 10 Nov 2026):** `@node-rs/argon2` 2.2.2 (MIT, no install script), `jose` 6.2.13 (MIT, no
  dependencies, 227M/week), `nodemailer` 10.2.1 (MIT-0) with `@types/nodemailer`, `@fastify/cookie` 11.1.5 (MIT, Fastify's own).
  The `argon2` package was rejected: it runs an install script, which our policy forbids. `jsonwebtoken` (the old
  setup's library) was not chosen: `jose` is newer, has no dependencies and supports current standards.
- Owner decision: **access + refresh tokens** (as in the old setup) instead of one opaque session token. Because every
  request still checks the session in the database, signing out and password changes work at once.
- Owner decision: **one email, one business** for now. The sign-up requirement's "a second business is added from
  inside the account" and the planned business switcher are left out. When we need them, a `memberships` table replaces
  `users.account_id` in one migration.
- Owner decision: **email only**. The requirement's mobile verification and WhatsApp-code sign-in wait until an OTP
  service exists (F25); until then the mobile number is collected but unverified and not unique, and we **block the app
  until the email is verified**, so every account has a reachable owner. The table `auth_tokens` (not `auth_codes`) holds
  only email links for now.
- Your `.env` already has `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` (copied from the hotel agent);
  F01 uses those names. Other leftovers there (`APP_NAME`, `GUEST_CHANNELS`) are ignored.
- The password list of common passwords starts small (a few hundred entries kept in the repo); a larger list can replace
  it later without code changes.
- Owner decision (10 Nov 2026): a **platform admin** can only **add industries** for now (`POST /api/v1/industries`). The
  flag is a column set by SQL, never by an API, and the app role cannot set it (column-level grants). Every request that
  changes something now needs our `Origin` and `X-Requested-With: toobler-web` headers (CSRF), including sign-up and login.
- Mailpit joins the Docker setup now for automated tests (the F00 brief said it would arrive with F01); your own
  development sends through your real SMTP settings.
- docs/SECURITY.md §2.2, the `api-security` skill and docs/FRONTEND.md §8 are updated to describe the access/refresh setup.
