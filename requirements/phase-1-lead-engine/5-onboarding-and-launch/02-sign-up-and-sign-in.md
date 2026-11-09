# Sign-up and sign-in

**Phase 1 · Onboarding · HubSpot equivalent: Account sign-up, Single sign-on (Enterprise)**

## What it is

A business owner creates an account alone. Staff sign in with email and password, or with their mobile number and a
6-digit code sent on WhatsApp.

## Why it matters

Today we create every account by hand. To grow, businesses must be able to start alone.

## How it works

1. Owner enters name, business name, email and mobile.
2. Mobile is confirmed by a WhatsApp code; email by a link.
3. They choose their industry, which sets presets (stages, fields, wording).
4. They land in the [setup wizard](03-setup-wizard.md).

**Sign-in options:** email and password, or mobile number and a WhatsApp code. "Forgot password" by email.

## Rules

- One email or mobile can't make two businesses by mistake; a second business is added from inside the account.
- Too many wrong codes or passwords locks sign-in for 15 minutes.

## Done when

- [ ] A new owner signs up and reaches setup in under 2 minutes.
- [ ] WhatsApp code sign-in works for staff.
- [ ] Lockout works.

## For developers

- **Code folder:** `apps/api/src/core/auth`
- **API:** [API.md](../../API.md), Phase 1 → Sign-up and sign-in
- **Tables:** `users`, `sessions`, `auth_codes` (`phone`, `code_hash`, `expires_at`, `tries`).
