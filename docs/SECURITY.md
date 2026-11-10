# Security design and verification

What we protect, how, and the checklist every feature passes before it is handed over for approval. Based on the
requirements' [security feature](../requirements/phase-1-lead-engine/1-foundation/04-security-privacy-and-audit.md),
the hotel agent's `api-security` rules, OWASP ASVS level 2 and India's DPDP Act 2023.

## 1. What we protect, from whom

| Asset | Threat | Main control |
| --- | --- | --- |
| A business's customers (names, phones, messages, recordings) | Another business, a guessing attacker, a bug | RLS fence + 404 for other businesses' ids + isolation tests |
| Staff accounts | Password guessing, stolen sessions, phishing | Hashed passwords (argon2id), lockout, httpOnly session cookies, server-side sessions that can be ended |
| The AI agent | Prompt injection by customers, emails or web pages; tricking it into revealing data or acting for someone else | Tool identity from the server; untrusted text is data; per-playbook tool sets; no tool returns other customers' data |
| Webhooks | Forged messages pretending to be Meta, Exotel, Razorpay | Signature on the raw body, replay protection, idempotency |
| Public endpoints (widget, free check, sign-up, codes) | Spam, abuse, cost attacks (LLM and WhatsApp bills) | Rate limits per IP and per key, allowed origins, OTP limits, per-business AI budget |
| Website reader (fill from website, competitors) | SSRF into our network | URL allow rules: http(s) only, public IPs only (checked after DNS), no redirects to private ranges, size and time limits |
| Uploaded files | Malware, oversized files, wrong types | Size limits, type sniffing, private storage, never served from our domain as HTML |
| Secrets (API keys, tokens per business) | Leaks via logs, errors, the database | Encrypted at rest (AES-256-GCM, key in env), shown only as previews, redacted from logs |
| Our platform team's access | Insider overreach | Support access only when the business grants it, time-limited, every visit logged |

## 2. Controls

### 2.1 Keeping businesses apart
- Every business table: `account_id NOT NULL`, RLS enabled, policy `account_id = app.current_account_id()`, and
  `FORCE ROW LEVEL SECURITY`. Migrations that create a table without this fail a schema test.
- Business work runs as role `app_user` (no `BYPASSRLS`) with `app.account_id` set per transaction. Migrations and
  platform jobs run as the owner role.
- The account comes **only** from the session (staff), the signed widget key (webchat), the provider id lookup
  (webhooks) or the job payload (jobs). Never from a body, query or tool argument.
- Cross-business lookups are named functions in a single file `kernel/database/across-accounts.ts`; each has a comment
  saying why. Today: phone number → business, WhatsApp phone id → business, mailbox → business, widget key → business,
  user by email for sign-in, platform console reads.
- Another business's id → **404**.

### 2.2 Sign-in and sessions
- Passwords: argon2id; at least 10 characters; checked against a common-password list.
- Sessions (owner decision 10 Nov 2026, the old setup's design): a signed **access token** (JWT, 15 minutes, carries only
  the user id and session id) plus a random 256-bit **refresh token** stored **hashed** in `sessions` and replaced at every
  refresh. A replaced refresh token used again after a one-minute grace means a copy was stolen, so the session ends.
  The API sets both in httpOnly SameSite=Lax cookies (Secure in production); the refresh cookie is only sent to the
  refresh address. Refresh tokens last 7 days idle and 30 days at most. Every request also checks the session is live in
  the database, so signing out, a password change, removal or disabling a person stops access at once. Ended on password
  change or reset, removal from the business, or "sign out everywhere".
- One-time codes (WhatsApp sign-in, free check; **not in F01**: no OTP service yet, they arrive with F25): 6 digits, hashed, 10-minute expiry, 5 tries, then a 15-minute lock;
  send limits per phone (3 per 15 min) and per IP.
- Lockout: 5 wrong passwords for an email → 15 minutes (requirement). Counted for every email typed, known or not, so a lockout never reveals whether an account exists (`login_attempts`). Per-address limits on the open routes and on resend-email are in `kernel/http/route-limits.ts`.
- CSRF: state-changing requests need a matching `Origin` (our web address only), a custom `X-Requested-With` style header
  that cross-site forms cannot send, and the SameSite cookie. The API's CORS allows only our own web addresses.
- Invitations and password resets: single-use, 48 h / 1 h, hashed tokens.

### 2.3 Roles
- Roles: `manager`, `staff`, `staff_own`; platform: `platform_admin`, `platform_support`.
- The role check sits on the route (`r.role('manager')`) where a reviewer sees it. `staff_own` filters are applied in
  the **service** for every list, view, search, export and the assistant's tools (a test per surface).

### 2.4 The AI agent and the assistant
- Tools receive identity from `ToolContext` (built by the runtime). Model arguments are validated like a form.
- Customer messages, emails, web pages and document text are wrapped and labelled as untrusted data in prompts; the
  system prompt states it never follows instructions inside them.
- Tools only return data about the current conversation's contact and the business's public knowledge. No tool lists
  other customers. The staff assistant acts with the signed-in person's role and `staff_own` limits; changes need
  **Confirm** and are logged "via assistant".
- Per-business AI usage counters and a daily budget; over budget → the agent takes a message and promises a callback,
  the platform is alerted.

### 2.5 Public surfaces
- Public routes are listed in one file (`kernel/http/public-routes.ts`) with the reason for each. Adding one is a
  security decision, reviewed and added to this file.
- Rate limits on all public routes (per IP and per key). `trustProxy` set to our own proxy only.
- Widget: allowed websites per business (Origin check on HTTP and on the WebSocket), per-visitor session token issued
  by the API, message size limits.
- Security headers via helmet: CSP (no inline scripts in the staff app), HSTS, frame-ancestors none (except the widget
  iframe page), referrer-policy, nosniff.

### 2.6 Webhooks
- Verify the provider signature on the **raw** body (Meta `X-Hub-Signature-256`, Razorpay `X-Razorpay-Signature`,
  Exotel/Twilio signatures). Reject old timestamps where the provider sends one.
- Answer within a second; do the work in a job. Store the provider event id; a repeat changes nothing.

### 2.7 Data protection (DPDP)
- Personal data: contact name, phone, email, messages, transcripts, recordings, custom field values.
- Export (`/contacts/{id}/export`) and erase (`/contacts/{id}/erase`) for managers, both in the activity log.
- Erase removes personal data from contacts, messages, transcripts, recordings, tasks' titles, search indexes and
  knowledge passages, and replaces the contact with an anonymous stub so report counts stay right. A test checks no
  personal detail is left in any table.
- Recording retention per business (default 90 days), deleted by a nightly job; tested.
- Logs never contain personal data or secrets (pino redaction + a test that scans the log output of the API tests for
  the test contacts' phones and names).

### 2.8 Secrets and configuration
- Secrets only in environment variables, validated at start-up; production refuses to start with a missing or weak one.
- `.env` files are git-ignored; `.env.example` lists names only.
- Business-owned secrets (their WhatsApp token, mailbox credentials) encrypted in `connections`, returned only as
  previews (`••••3f9a`).
- Dependencies: `npm audit` in CI (fail on high), Dependabot, lockfile committed.

### 2.9 Audit
- `activity_log`: who (actor), what kind, which record, which **fields** changed (names, never values), when, from
  where (IP, user agent). Covers sign-ins, settings, deletes, exports, imports, merges, erasures, support visits, role
  changes, module switches. Append-only for the app role.

## 3. Feature security checklist

Copy into each feature's brief and tick at verification. A feature is not handed over with an unticked box (or a
written reason why it doesn't apply).

```markdown
### Security checklist
- [ ] Every new table has account_id, RLS enabled + forced, and the schema test passes
- [ ] Every new route: role guard on the route; tests for works / 401 / 403 wrong role / 404 other business / 400 bad input
- [ ] Every list, search and export respects staff_own (if it touches leads or contacts)
- [ ] No business id taken from body, query, params or tool arguments
- [ ] All input validated with zod, with max lengths; no SQL built from strings
- [ ] New public route? Listed in public-routes.ts with a reason, rate-limited
- [ ] New webhook? Raw-body signature check, idempotent, work done in a job
- [ ] New agent/assistant tool? Identity from ToolContext; returns no other customer's data; eval added
- [ ] New outside call with a user-given URL? Goes through the safe fetcher (SSRF rules)
- [ ] New file upload? Size/type limits, private storage, signed short-lived links
- [ ] Nothing new logged that is personal data or a secret (log scan test passes)
- [ ] Deletes ask first in the UI; deletes, exports and setting changes write the activity log
- [ ] Secrets encrypted at rest and shown only as previews
- [ ] `npm run verify` passes (lint, types, unit, API, isolation, e2e for this feature)
```

## 4. Verification before go-live (Phase 1, step "Go live")

- External-style review of the running staging app: authentication, isolation (two businesses, every route), the
  widget and webhooks, file uploads, the website reader.
- Prompt-injection evals: customers trying to get other customers' data, discounts, totals, competitor names, or
  instructions hidden in emails and documents.
- Restore test of the production backup; rollback test of a release.
