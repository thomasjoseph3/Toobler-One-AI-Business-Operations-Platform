# F01: Sign-up, sign-in and sessions

**Requirements:** `5-onboarding-and-launch/02-sign-up-and-sign-in.md`; docs/SECURITY.md §2.2; docs/BACKEND.md §2
**Depends on:** F00      **Module:** `core.auth` (core)

## Feature guide

*Written for the people who use Toobler One and for the team that builds it. The first parts need no technical knowledge; the part marked "For the tech team" is for developers.*

### What it does
Lets a business owner create an account on their own, prove their email, and sign in later with email and password. After signing in they are "inside their business": everything they save is kept for that business and shown only to the right people. It covers:
- **Sign-up:** your name, business name, work email, mobile number, password and industry. This creates the business and makes you its manager.
- **Email check:** a link is emailed to you (valid 48 hours); the app is not usable until you click it.
- **Sign-in, sign-out, forgot and reset password** (the reset link is valid 1 hour), and **changing your password**.
- **Your profile:** your name, your business, your role, which parts of the product are on.

### Why it is useful
- **Self-service.** No one at Toobler has to set a business up by hand.
- **Safe.** Passwords are stored in a way nobody can read back. Too many wrong tries lock the account for a short time. Signing out or changing a password ends other sign-ins at once.
- **Every account has a reachable owner,** because the email must be verified.

### How it works: a day in the life
1. An owner opens the sign-up page and fills in the form. A business and a manager account are created, and an email arrives.
2. They click the link in the email. They are now in the app, and the top bar shows their business name.
3. Next morning they sign in with email and password. The app quietly renews their sign-in in the background while they work.
4. They forget their password: they ask for a reset link, set a new password, and every older sign-in is ended.

### Who can do what
Anyone can sign up, sign in and reset a password. Once signed in, every person can see and edit their own profile and change their own password. (Inviting team members and choosing roles is F02.)

### Settings and limits
| What | Value |
| --- | --- |
| Password | At least 10 characters, not on a list of common passwords, not your email or mobile |
| Wrong passwords before a lock | 5 (locked for 15 minutes; the message is the same for an unknown email) |
| Email verification link | 48 hours, single use |
| Password reset link | 1 hour, single use |
| Stay signed in | 7 days if unused, 30 days at most |
| One email | One business (a second sign-up with the same email is refused) |

### What it will never do
- Tell an outsider whether an email has an account when signing in (unknown email and wrong password look the same).
- Put tokens where web-page code can read them, or write passwords, tokens, emails or mobile numbers into logs.
- Let a request pick which business it acts on: the business always comes from the signed-in person.

### Not part of this feature
Adding team members and roles (F02), switching between businesses, verifying the mobile number or signing in with a WhatsApp code (F25), and the sign-in screens, which wait for the designer.

### For the tech team
- **Module:** `core.auth`. Migration `002_auth.sql`. Tables: `accounts` (own RLS on `id`), `users` (fenced), and four **global** tables the app role cannot touch at all: `user_credentials` (argon2id hashes), `sessions`, `auth_tokens`, `login_attempts`, reached only through named functions in `kernel/database/across-accounts.ts`.
- **Tokens:** a 15-minute access JWT (HS256, `jose`) naming the user and session, plus a random refresh token stored only as a SHA-256 hash and **rotated at every use**. A replaced token used again after a one-minute grace ends the session. Both are `HttpOnly`, `SameSite=Lax` cookies set by the API (`toobler_access`, and `toobler_refresh` sent only to `/api/v1/auth/refresh`). Every request also checks the session is live in the database.
- **CSRF:** every unsafe request must carry an `Origin` equal to our web address and `X-Requested-With: toobler-web`, otherwise 403.
- **Routes:** `POST /auth/signup`, `/auth/verify-email`, `/auth/resend-email`, `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/logout`; `GET /me`, `PATCH /me`, `POST /me/password`; `GET /industries`, `POST /industries` (platform admin only). An expired access token answers `401 TOKEN_EXPIRED` so the web app refreshes once.
- **Mail:** behind an interface: `smtp` (nodemailer, using the `SMTP_*` settings) or `console` (prints the link outside production). Tests use Mailpit in Docker.
- **Settings:** `JWT_SECRET` (32+ characters), `ACCESS_TOKEN_MINUTES`, `SESSION_IDLE_DAYS`, `SESSION_MAX_DAYS`, `MAIL_PROVIDER`, `SMTP_*`, `EMAIL_FROM`; production refuses to start on a missing or example secret.

### Known limits
- The sign-in screens are built only for sign-in itself (on the branch `feature/F01-ui-sign-in`); the rest wait for the designer.
- The mobile number is collected but not verified and not unique.
- The common-password list is small (a few hundred entries) and can be replaced without code changes.

---

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

## Build order inside F01 (owner decision, 10 Nov 2026)
Slices of at most 2 API routes, backend first; **the screens come after the whole auth backend is finished**.

| Slice | Routes | State |
| --- | --- | --- |
| 1 | `POST /auth/signup`, `GET /industries` | done and tested by the owner |
| 2a | `POST /auth/login` | done and tested by the owner |
| 2b | `POST /industries` (platform admin: adding industries only) | done and tested by the owner |
| 3 | `POST /auth/logout`, `GET /me` | done and tested by the owner |
| 4 | `POST /auth/verify-email`, `POST /auth/resend-email` | done and tested by the owner |
| 5 | `POST /auth/refresh` | done and tested by the owner |
| 6 | lockout after 5 wrong passwords, rate limits, common-password list (no new route) | done and tested by the owner |
| 7 | `POST /auth/forgot-password`, `POST /auth/reset-password` | done and tested by the owner |
| 8 | `PATCH /me`, `POST /me/password` | done and tested by the owner |
| UI 1 | sign-in, sign-out and the signed-in guard (no new routes) | built, waiting for the owner's test |
| UI 2 | sign-up and the "check your email" screen (adds the "Create an account" link) | planned |
| UI 3 | the verify-email page, "verify your email" banner, resend | planned |
| UI 4 | forgot and reset password pages (adds the "Forgot password?" link) | planned |
| UI 5 | profile page: edit name and mobile, change password | planned |
| UI 6 | full-stack browser tests (real API and test database), hand-off script | planned |

**Design (owner decision, 13 Nov 2026):** the designer supplied only the Leads list frame, so these screens are designed by us in that style (design system v1.3 tokens, the Figma icons and logo) and listed in docs/FRONTEND.md for the designer to review. Built slice by slice on the branch `feature/ui-design-v1.3`.

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
