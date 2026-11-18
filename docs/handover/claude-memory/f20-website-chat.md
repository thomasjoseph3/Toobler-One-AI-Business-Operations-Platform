---
name: f20-website-chat
description: F20 website chat state (branch feature/F20-website-chat), what exists, how to run and test it, decisions R63, ports to avoid
metadata:
  type: project
---

F20 (website chat) is `in_review` since 16 Nov 2026: slices 1-4 committed (b4b9ad5, 4551da1, 3be2004, 87f53f0), slice 5 (journey test, Feature guide, manual script, security checklist, STATUS in_review) built but NOT committed until the owner says "commit". Waiting for the owner's manual test and "approved". Nothing pushed; F20 branch not merged into dev.

What exists: module channel.webchat (settings routes, public widget routes under /api/v1/public/widget/{key}, jobs webchat.find_idle_chats and webchat.end_idle_chats), apps/site (React chat window + plain loader.js, `npm run build:widget`), API serves /widget/*, migrations 040 and 041 (applied to the Supabase dev DB), Postman collection "Toobler One - F20 website chat (run in order)" folders 0-7, tests webchat-*.test.ts, e2e/website-chat.spec.ts (fixture servers on 3200-3202).

Test business left on the dev DB: "Widget Check Stays" (email in a temp file only; manager password Widget-check-2026-pass), allowed websites localhost:4000 and 127.0.0.1:4000; the owner may want it deleted.

**How to apply:** run browser tests with `E2E_WEB_PORT=3000 npm run e2e` (reuses the owner's running staff app; port 3100 belongs to the owner's other app, see [[never-kill-unknown-processes-or-take-fixed-ports]]). Chrome in this setup could not open 127.0.0.1:4000, so real-API checks were done with curl. Later: Channels > Website chat screen (designer), staff takeover (F21), streaming, in-browser call (F29), WhatsApp (F25). Decisions are R63 in docs/REQUIREMENTS-REVIEW.md. See [[f19-ai-agent-text]].
