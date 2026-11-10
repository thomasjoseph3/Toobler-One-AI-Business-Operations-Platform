# F01: Sign-up, sign-in and sessions

**Requirements:** `5-onboarding-and-launch/02-sign-up-and-sign-in.md`; docs/SECURITY.md §2.2; docs/BACKEND.md §2
**Depends on:** F00      **Module:** `core.auth` (core)

**Goal in one line:** a business owner can create an account alone, prove their email and mobile, sign in again later
(password, or a WhatsApp code), and land in the app *as a member of their business*, so everything built after this
(contacts, knowledge base, AI agent) is saved for the right business and shown only to the right people.

## Scope
- In:
  - Sign-up: name, business name, email, mobile, password, industry. Creates the business, the owner (role `manager`),
    and signs them in.
  - Verify email (link, 48 h) and mobile (6-digit code by WhatsApp; a console provider prints it to the API log until
    F25 connects the real WhatsApp). The app is not usable until both are verified.
  - Sign-in with email + password, or mobile + WhatsApp code. Forgot / reset password by email (link, 1 h).
  - Sessions (server-side, can be ended), sign out, sign out everywhere (on password change).
  - `GET /me`, `PATCH /me` (name), change password, **switch business**, **add a second business from inside the account**.
  - Lockout, rate limits, CSRF protection, the real `authenticate` that fills `request.principal`, and `RequestContext`
    (the `AccountContext` plus the signed-in person) for later features.
  - Mail provider (`console` and `smtp` to Mailpit in Docker) and messaging provider (`console`) behind interfaces.
  - Industry is chosen and stored; only the "general" preset exists for now (stages, fields and words arrive with F16/F31).
- Out (later feature): inviting staff, roles screens, removing members (F02); module switches and the menu coming
  from `/me` (F03); real WhatsApp sending (F25); platform admin login and support access (F03/F24); changing email or
  mobile (after F02); single sign-on and two-factor (not in Phase 1).

## Reused from the hotel agent
- Read: `src/modules/core/auth/{routes,service,sessions,repository}.js`, `src/middleware/auth.js` (489 lines). **We keep
  the ideas that still serve our goal, and change the design where our goal is different.**
- **Reused (ported):** the same answer and the same timing for an unknown email and a wrong password (a dummy hash is
  checked); login limits per email+address and per address; tokens stored only as a hash; ending the user's *other*
  sessions on a password change while keeping the current one; keeping ended sessions 90 days for "who signed in from
  where", then deleting them; refusing to log the query string.
- **Changed, and why:**
  - *Old:* JWT access token (15 min) + rotating refresh token, kept in cookies by a Next.js server. *New:* one opaque,
    random session token, stored hashed, in an httpOnly cookie set by the API itself. There is no Next.js server, and
    an ended session must stop working at once; JWT + refresh adds machinery we don't need. (SECURITY.md §2.2.)
  - *Old:* only a platform admin could create users, and a user belonged to a list of businesses in a column. *New:*
    owners sign up alone; membership is a table (`memberships`, one row per person per business, fenced by account).
  - *Old:* bcrypt. *New:* argon2id (`@node-rs/argon2`, vetted: no install script).
  - *Old:* a platform "super admin" role mixed in with business roles. *New:* platform people are separate and arrive
    with F03/F35; F01 has business roles only.
  - Added (not in the old code): email and mobile verification, WhatsApp code sign-in, forgot/reset, CSRF check.
- **Left behind:** the MCP client sessions (F30), the support-access visits (F24), the property/hotel wording.

## Database (migration `002_auth.sql`)
Tables without an `account_id` are global on purpose: they exist before a business is known. They are reached only
through named functions in `kernel/db/across-accounts.ts`, and the app role (`app_user`) gets **no access** to them, so
a fenced query can never read another person's login.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `accounts` | The business itself | `id`, `name`, `industry`, `time_zone` (default Asia/Kolkata), `created_at`. RLS on `id`: a fenced query sees only its own row. |
| `users` | One person, across businesses | `id`, `email` (lower-cased, unique), `name`, `password_hash`, `mobile_e164` (unique), `mobile_key` (last 10 digits), `email_verified_at`, `mobile_verified_at`, `status` (active/disabled), `last_login_at` |
| `memberships` | Who belongs to which business, with their role | `account_id`, `user_id`, `role` (manager/staff/staff_own), unique per pair. **Fenced** (account_id, RLS forced). |
| `sessions` | One sign-in on one device | `id`, `user_id`, `current_account_id`, `token_hash` (unique), `user_agent`, `ip`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`, `revoked_reason` |
| `auth_codes` | Single-use secrets | `kind` (email_verify, password_reset, mobile_verify, mobile_login), `user_id`, `secret_hash`, `expires_at`, `tries`, `used_at`. Links are long random tokens; mobile codes are 6 digits. Both stored hashed. |
| `login_attempts` | Lockout counters | `key_hash` (hash of the email or mobile, so unknown accounts behave the same), `failed_count`, `locked_until` |

The schema test's list of global tables gets these five (each with its reason); `memberships` must pass the RLS check.

## API (all under `/api/v1`)
| Method | Address | Who | Notes |
| --- | --- | --- | --- |
| POST | `/auth/signup` | Public | Creates business + owner + session; sends the email link and the mobile code. If the email or mobile is already registered it says so (sign-up cannot hide that, so it is rate-limited hard: 5 per hour per address, to slow anyone checking who has an account). |
| POST | `/auth/verify-email` | Public | `{ token }`; single use. |
| POST | `/auth/resend-email` | Staff (signed in, unverified allowed) | 3 per 15 min. |
| POST | `/auth/send-mobile-code` | Staff (unverified allowed) | 3 per 15 min per number, 10/hour per address. |
| POST | `/auth/verify-mobile-code` | Staff (unverified allowed) | 5 tries, then locked 15 min. |
| POST | `/auth/login` | Public | Email + password. Lockout after 5 wrong; same message and timing for unknown email. |
| POST | `/auth/login/code/send` | Public | Mobile number; always answers "if registered, a code was sent". |
| POST | `/auth/login/code/verify` | Public | Mobile + code; 5 tries then lock. |
| POST | `/auth/forgot-password` | Public | Always the same answer; emails a 1 h link if the email exists. |
| POST | `/auth/reset-password` | Public | `{ token, password }`; ends all sessions. |
| POST | `/auth/logout` | Staff | Ends this session, clears the cookie. |
| GET | `/me` | Staff (unverified allowed) | The person, verification state, current business, all their businesses with roles. |
| PATCH | `/me` | Staff | Name. |
| POST | `/me/password` | Staff | Current + new password; ends the other sessions. |
| POST | `/me/switch-business` | Staff | `{ accountId }`; only a business they belong to (another id → 404). |
| POST | `/me/businesses` | Manager | Creates a second business, the caller becomes its manager. |

Every unsafe request (POST/PATCH/DELETE) must carry an `Origin` equal to our web address and the header
`X-Requested-With: toobler-web`; otherwise 403. Public routes are added to `public-routes.ts`, each with its reason.

## Screens (`apps/web`, phone first)
- **Sign up:** one card: your name, business name, work email, mobile, password (show/hide, rules shown as you type), industry.
  Error text under each field; button "Create my account".
- **Verify:** two steps with a progress hint: "Check your email" (resend) and "Enter the code we sent on WhatsApp"
  (6 boxes, resend after 30 s). Reaching the app is blocked until both are done.
- **Sign in:** two tabs, "Password" and "WhatsApp code"; "Forgot password?" link; lockout message ("Try again in 15 minutes").
- **Forgot / reset password:** email form, then new password form.
- **Profile** (from the top-bar person menu): name, change password, sign out.
- **Business switcher** in the top-bar person menu: the person's businesses with their role, "Add another business".
- Shared pieces: auth layout (centered card, brand mark), `RequireSignIn` wrapper, `/me` loading state; every form has
  loading, error and success states, keeps what was typed after an error.

## Rules to enforce
- Passwords: at least 10 characters, not on a common-password list, not equal to the email or mobile.
- Sessions: random 256-bit token; stored as a SHA-256 hash; cookie `toobler_session` (`__Host-` prefix in production),
  `HttpOnly`, `SameSite=Lax`, `Secure` in production; 12 h idle timeout, 30 days maximum; a new session on every sign-in
  (no reuse); ended on password change/reset (all but the current one on a change).
- Lockout: 5 wrong passwords (or wrong codes) for the same email or mobile locks that key for 15 minutes.
- Unknown email, wrong password and locked account all look the same to the caller.
- One email or mobile can't create two accounts; a second business is only added from inside.
- The business of a request comes **only** from the session (`current_account_id`), never from the body, query or URL.
- Never log the password, token, code, email or mobile (the console providers print a code only outside production,
  and only the last 4 digits of the number).

## Tests
- **Unit:** password rules; phone normalisation to E.164 and `mobile_key` (+91, 0, spaces, dashes); code and token
  generation and hashing; lockout counter; cookie settings per environment.
- **API (every route: works / 401 / 403 / 404 other business / 400 bad input):** sign-up creates the business, owner,
  membership and session; duplicate email or mobile refused; lockout after 5 with the 15-minute message; unknown email
  identical to wrong password; code expiry and 5 tries; reset ends all sessions; password change keeps the current session
  only; session expiry (idle and absolute); switching to a business you don't belong to → 404; the second business is
  separate (a contact-style probe row of business A is invisible in B); CSRF (missing/wrong Origin or header → 403);
  `/me` reveals only the caller's data; logs contain no secrets; the app role cannot read `users`/`sessions`.
- **Isolation:** `memberships` and `accounts` pass the schema test; a fenced query cannot see another business.
- **E2E (Playwright, phone and desktop):** sign up → verify email (link read from Mailpit) → verify mobile (code read
  from the API log) → lands in the app; sign out; sign in by password and by WhatsApp code; wrong password ×5 shows
  the lockout; forgot/reset; switch business; axe accessibility on every new screen in both themes.

## Manual test script
1. `npm run setup` (starts Mailpit with the test database), then restart your API terminal.
2. Open http://localhost:3000, you are sent to the sign-in page. Choose **Create an account** and fill the form → you
   see "Check your email" and the WhatsApp step.
3. Open Mailpit at http://localhost:8025, click the verification link → email ticked.
4. Read the 6-digit code from your API terminal (the console provider prints it) and enter it → you reach Today.
5. Sign out from the person menu, sign in with email and password; sign out; sign in with your mobile and a code.
6. Enter a wrong password 5 times → "Try again in 15 minutes", and the same message for an email that doesn't exist.
7. Forgot password → open the email in Mailpit → set a new password → old password no longer works, other browser is signed out.
8. Add a second business from the person menu, switch between them, and see each one's name in the top bar.
9. `npm run verify` is green.

## Security checklist
- [ ] Every new table has account_id, RLS enabled + forced, and the schema test passes (global tables listed with reasons; `app_user` has no access to them)
- [ ] Every new route: role guard on the route; tests for works / 401 / 403 wrong role / 404 other business / 400 bad input
- [ ] Every list, search and export respects staff_own (n/a: no lists yet)
- [ ] No business id taken from body, query, params or tool arguments (the session decides; `switch-business` checks membership)
- [ ] All input validated with zod, with max lengths; no SQL built from strings
- [ ] New public routes listed in public-routes.ts with a reason, rate-limited
- [ ] New webhook? (n/a)
- [ ] New agent/assistant tool? (n/a)
- [ ] New outside call with a user-given URL? (n/a)
- [ ] New file upload? (n/a)
- [ ] Nothing new logged that is personal data or a secret (log scan test passes)
- [ ] Deletes ask first in the UI; sign-ins, password changes and business creation write the activity log
- [ ] Secrets encrypted at rest and shown only as previews (n/a: no stored third-party secrets; tokens and codes are hashed)
- [ ] `npm run verify` passes

## Decisions and differences from the requirements
- **Dependencies to add (vetted 10 Nov 2026 unless noted):** `@node-rs/argon2` 2.2.2 (MIT, 3.1M/week, no install
  script), `nodemailer` 10.2.1 (MIT-0, 36.8M/week) with `@types/nodemailer`, `@fastify/cookie` (to be vetted before install).
  The `argon2` package was rejected: it runs an install script, which our policy forbids.
- Requirement says the mobile is confirmed during sign-up; we **block the app until both email and mobile are
  verified**, so every account has a reachable owner (the AI agent will later alert them).
- The password list of common passwords starts small (a few hundred entries kept in the repo); a larger list can replace
  it later without code changes.
- Sessions live in our database, not in JWTs (see "Changed" above).
- Mailpit joins the Docker setup now (the F00 brief said it would arrive with F01).
