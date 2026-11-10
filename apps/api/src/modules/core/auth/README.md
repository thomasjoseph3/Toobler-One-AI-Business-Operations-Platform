# core.auth: sign-up, sign-in, sessions and passwords

Built in slices of at most 2 API routes (see `docs/features/F01-sign-up-and-sign-in.md`). This file says where things
live and how a request travels, so you can find any piece quickly.

## The one rule for finding things

Open the folder named for the layer. The feature's name is in the file name.

| Folder | What is in it |
| --- | --- |
| `routes/` | `sign-up.routes.ts` (`POST /auth/signup`), `sessions.routes.ts` (`POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`), `profile.routes.ts` (`GET /me`), `email-verification.routes.ts` (`POST /auth/verify-email`, `POST /auth/resend-email`) |
| `services/` | `sign-up.service.ts`, `sessions.service.ts`, `profile.service.ts`, `email-verification.service.ts`: the rules and the steps |
| `repositories/` | One file per table: `accounts`, `users`, `credentials`, `sessions`, `auth-tokens`, `login-attempts` |
| `helpers/` | Shared tools with no routes: `passwords.ts`, `phone.ts`, `tokens.ts`, `cookies.ts`, `verification-email.ts` (the email's text), `common-passwords.ts` (passwords sign-up refuses) |
| `authenticator.ts` | Tells the kernel who is signed in on every request |

## How a request travels

```text
HTTP request
  → kernel checks (CSRF, rate limit, "is a signed-in person needed?")      apps/api/src/kernel/
  → routes/<feature>.routes.ts      checks the request shape, calls the service, sends the answer
  → services/<feature>.service.ts   the rules and the steps (hash the password, save, send an email...)
  → repositories/<table>.repository.ts   the SQL, nothing else
  → the database (through kernel/database)
```

Only the files in `repositories/` talk to the database. Routes never call a repository directly (the linter enforces it).

### How a service reaches a repository

There is no wiring file. The service imports the repository file and calls its functions. From `profile.service.ts`:

```ts
import * as usersRepository from '../repositories/users.repository';
...
const person = await usersRepository.findPersonProfileById(transaction, principal.userId);
```

Each service file also lists, in a comment at the top, the repositories it uses.

## Outside services

The mail sender lives outside the modules, in `apps/api/src/providers/mail/` (a real mail server, or the terminal for
development). A service reaches it as `app.kernel.mail`, never by importing the provider.

## Adding a feature

1. Add `routes/<feature>.routes.ts` and `services/<feature>.service.ts` (tests go in `apps/api/test/`).
2. Put its SQL in `repositories/<table>.repository.ts` (add to an existing file if the table already has one).
3. Register the routes with one line in `module.ts`.
4. If it is an open route (no sign-in), list it in `apps/api/src/kernel/http/public-routes.ts` with the reason.

## Files at the top

- `module.ts`: declares the module (`core.auth`) and registers each route file.
- `index.ts`: the only file other modules may import from. Empty for now.
