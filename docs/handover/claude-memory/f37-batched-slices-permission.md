---
name: f37-batched-slices-permission
description: "For F37 (AI models and keys) the owner allowed building all slices (2 routes at a time, tested each) before one hand-off; AI design decisions made with it"
metadata:
  node_type: memory
  type: project
  originSessionId: 2289cb64-d2c2-4a74-8153-5182a5a0bf7a
  modified: 2026-11-13T07:49:21.544Z
---

On 13 Nov 2026 the owner gave explicit permission for **F37** only: "complete 2 apis at a time, validate and test, then write the journey and integration tests and complete the feature". So F37's nine slices were built and tested one after another without stopping between them, then handed off once (`in_review`). This does **not** change the standing rule for later features ([[small-api-slices]]): stop after each slice unless the owner says so again.

**Decisions made with it (all in `docs/features/F37-ai-models-and-keys.md`):** LangChain + LangGraph behind `providers/llm` and `core.ai`; direct calls, no OpenRouter; small cheap models for simple jobs; model order per job (developer preset, platform setting, business override); own keys vs the platform's (demo cap and end date); warning emails to the manager (own keys) or the platform team (platform keys); platform keys in `.env` as `GEMINI_API_KEYS`, `OPEN_AI_API_KEY`, `CLAUDE_API_KEY`; `SECRETS_ENCRYPTION_KEY` scrambles saved keys (back it up).

**Why:** the owner wanted F37 finished before the UI work starts, and F15 (conversation types and router) comes right after F37 is approved.
**How to apply:** after F37 approval, F15 and F19 should call `createAiService` (from `core/ai/index.ts`) and never import a provider package. See [[feature-gate-workflow]].
