---
name: postman-mcp-and-collections
description: Postman MCP server is connected (user scope); where the Toobler One collections and environment live, and what the Postman tools can and cannot do
metadata:
  type: reference
---

The Postman MCP server (`https://mcp.postman.com/mcp`) was added at user scope on 2026-11-12; the API key lives in the
owner's Postman account settings, never in this repo or chat (the owner keeps `POSTMAN_API_KEY` in `.env`, which I must not read or print).

Created for F06 in the owner's **My Workspace** (id 85209133-ecc7-4116-8fdb-e3c2c6251aec), account "Thomas Joseph", team "brandit":
- collection *Toobler One - F06 leads and pipeline (run in order)* (folders 0 to 7, each request has tests that save ids)
- collection *Toobler One - other routes (by hand)*
- environment *Toobler One - local dev* (baseUrl, webOrigin, email, password-secret)

The tools can create and edit collections, environments, mocks and monitors, but **cannot send a request**. The API's own OpenAPI
file at `http://localhost:4000/docs/json` (development only) is the source for building collections.

**Why:** the owner wants to test each slice in Postman rather than type requests by hand.
**How to apply:** after each new feature, add or update its folder in the F06-style collection (new collection per feature area), tell the
owner the workspace and names, and ask before writing to Postman. Never run requests against the Supabase dev database myself. See [[small-api-slices]] and [[feature-gate-workflow]].
