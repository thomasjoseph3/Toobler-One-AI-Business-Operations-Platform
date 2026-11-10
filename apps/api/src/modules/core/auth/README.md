# core.auth: sign-up, sign-in, sessions and passwords

Built in slices of at most 2 API routes (see `docs/features/F01-sign-up-and-sign-in.md`). This file says where things
live and how a request travels, so you can find any piece quickly.

## How a request travels

```text
HTTP request
  → kernel checks (CSRF, rate limit, "is a signed-in person needed?")      apps/api/src/kernel/
  → <feature>/routes.ts     checks the request shape, calls the service, sends the answer
  → <feature>/service.ts    the rules and the steps (hash the password, save, send an email...)
  → data/<table>.repository.ts   the SQL, nothing else
  → the database (through kernel/database)
```

Only the files in `data/` talk to the database. Routes never call a repository directly (the linter enforces it).

## The folders

| Folder | What is in it | Slice |
| --- | --- | --- |
| `sign-up/` | `POST /auth/signup`: creates the business and its owner | 1 |
| `password/` | Password hashing (argon2id) and the password rules. Later: forgot, reset and change password | 1, 7, 8 |
| `helpers/` | Small pure functions more than one feature uses (mobile number cleaning) | 1 |
| `data/` | One repository per table: `accounts`, `users`, `credentials` (later `sessions`, `auth-tokens`, `login-attempts`) | 1 and on |
| `sessions/` (not yet) | Login, logout, refresh, the access token, the cookies, "who is signed in" | 2, 3, 5 |
| `email-verification/` (not yet) | Verify and resend, and the text of the emails | 4 |
| `profile/` (not yet) | `GET` and `PATCH /me` | 2, 8 |

## Adding a feature

1. Make a folder named for the feature, with `routes.ts` and `service.ts` (and tests next to them).
2. Put its SQL in `data/<table>.repository.ts` (add to an existing file if the table already has one).
3. Register the routes with one line in `module.ts`.
4. If it is an open route (no sign-in), list it in `apps/api/src/kernel/http/public-routes.ts` with the reason.

## Files at the top

- `module.ts`: declares the module (`core.auth`) and registers each feature's routes.
- `index.ts`: the only file other modules may import from. Empty for now.
