---
name: dev-database-demo-data-allowed
description: Owner allowed demo data in the current DATABASE_URL (their dev database) on 2026-11-13; a better dev DB comes later
metadata:
  type: project
---

On 2026-11-13 the owner said the current database (the Supabase one in DATABASE_URL) is used for local development, so adding dummy data to it is fine; they will get a separate, better development database later.

**Why:** CLAUDE.md says never run seeds against DATABASE_URL, but the owner explicitly made an exception for the demo seed (`npm run db:seed:demo -- --allow-remote`, marked "Demo: Nair Stays").

**How to apply:** The owner also said (13 Nov 2026) "you can yourself seed the data": run the seed myself when screens or tests of the app need demo data, without asking first. It is safe to repeat (adds only what is missing). This covers the demo seed only, not tests or experiments (those still use TEST_DATABASE_URL). Keep the `--allow-remote` flag as the safety net. When the owner gets the new dev database, the exception ends. See [[feature-gate-workflow]].
