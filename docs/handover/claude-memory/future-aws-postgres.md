---
name: future-aws-postgres
description: "Owner plans to move from Supabase to AWS-hosted Postgres, with the app on EC2"
metadata:
  node_type: memory
  type: project
  originSessionId: b4a70e5c-218e-4b97-ba5f-aac7e041157a
  modified: 2026-11-09T12:09:38.417Z
---

Owner said (2026-11-09) that in future the database moves from Supabase to a Postgres on AWS, and the app is hosted on an EC2 too. Decided: it will be RDS (confirmed by the owner), but only in the future; keep using Supabase for now.

**Why:** deployment target; affects config, SSL rule, roles and backups.

**How to apply:** keep DB access env-driven (DATABASE_URL / DATABASE_SSL), avoid Supabase-only features (Supabase Storage, auth schema, pooler quirks) in new code; docs/ARCHITECTURE.md §232-245 still say Supabase and need updating when the owner decides. See [[lead-engine-rebuild]].
