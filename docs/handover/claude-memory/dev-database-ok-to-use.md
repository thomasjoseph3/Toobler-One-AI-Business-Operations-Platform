---
name: dev-database-ok-to-use
description: Owner allows Claude to read and write the Supabase development database for things that do not affect the setup (13 Nov 2026)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 2289cb64-d2c2-4a74-8153-5182a5a0bf7a
  modified: 2026-11-13T08:29:46.094Z
---

On 13 Nov 2026 the owner said: "you can do fetching from the db and writing right you do it, that is just the dev database, it is okay for you to do things that doesn't affect our setup." So Claude may **read and make ordinary, reversible changes** in the development (Supabase) database through the project's own commands (for example `npm run platform-admin -- list|grant|revoke`, `npm run db:migrate`) without asking each time.

**Still not allowed without asking:** anything that wipes or rebuilds data, drops tables or schemas, runs the test suite or seed scripts that delete rows against `DATABASE_URL` (tests use `TEST_DATABASE_URL`), or changes the owner's real accounts in a way that locks them out. Never print `.env` values. See [[lead-engine-rebuild]] for the DB cautions.

**Why:** it is the development database, and the owner wants things done instead of being handed SQL to paste.
**How to apply:** when a task needs a lookup or a small write in the dev DB, do it and say what was done. Prefer a command that exists in the repo over raw SQL.
