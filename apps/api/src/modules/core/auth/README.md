# core.auth: sign-up, sign-in, sessions and passwords

Built in slices of at most 2 API routes (see `docs/features/F01-sign-up-and-sign-in.md`). This file says where things
live and how a request travels, so you can find any piece quickly.

## The one rule for finding things

- A folder **with a `routes.ts`** is a feature (`sign-up`, `sessions`, `profile`, later `email-verification`).
- `helpers/` holds shared tools that have no routes (password hashing and rules, mobile number cleaning).
- `repositories/` holds the database code, one file per table.

## How a request travels

```text
HTTP request
  → kernel checks (CSRF, rate limit, "is a signed-in person needed?")      apps/api/src/kernel/
  → <feature>/routes.ts     checks the request shape, calls the service, sends the answer
  → <feature>/service.ts    the rules and the steps (hash the password, save, send an email...)
  → repositories/<table>.repository.ts   the SQL, nothing else
  → the database (through kernel/database)
```

Only the files in `repositories/` talk to the database. Routes never call a repository directly (the linter enforces it).

### How a service reaches a repository

There is no wiring file. The service imports the repository file and calls its functions. From `profile/service.ts`:

```ts
import * as usersRepository from '../repositories/users.repository';
...
const person = await usersRepository.findPersonProfileById(transaction, principal.userId);
```

Each `service.ts` also lists, in a comment at the top, the repositories it uses.

## The folders

| Folder | What is in it |
| --- | --- |
| `sign-up/` | `POST /auth/signup`: creates the business and its owner |
| `sessions/` | `POST /auth/login`, `POST /auth/logout`, the access token, the cookies, "who is signed in" (later: refresh) |
| `profile/` | `GET /me` (later: `PATCH /me`) |
| `helpers/` | `passwords.ts` (argon2id hashing and the password rules), `phone.ts` (mobile number cleaning) |
| `repositories/` | `accounts`, `users`, `credentials`, `sessions` (later: `auth-tokens`, `login-attempts`) |
| `email-verification/` (not yet) | Verify and resend, and the text of the emails (slice 4) |

## Adding a feature

1. Make a folder named for the feature, with `routes.ts` and `service.ts` (and tests next to them).
2. Put its SQL in `repositories/<table>.repository.ts` (add to an existing file if the table already has one).
3. Register the routes with one line in `module.ts`.
4. If it is an open route (no sign-in), list it in `apps/api/src/kernel/http/public-routes.ts` with the reason.

## Files at the top

- `module.ts`: declares the module (`core.auth`) and registers each feature's routes.
- `index.ts`: the only file other modules may import from. Empty for now.
