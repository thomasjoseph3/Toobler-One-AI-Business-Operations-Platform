# core.ai: AI models and keys

Built in slices of at most 2 API routes (see `docs/features/F37-ai-models-and-keys.md`). Every AI feature asks this module for "the
model for this job" and never talks to Gemini, OpenAI or Claude itself. The only code that does is `apps/api/src/providers/llm/`.

| Folder          | What is in it                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`       | `ai-models` (GET /ai/models), `ai-keys` (POST, GET /ai/keys, DELETE /ai/keys/{id}, POST /ai/keys/{id}/test), `ai-settings` (GET, PUT /ai/settings), `ai-usage` (GET /ai/usage, /ai/status), `ai-call-log` (GET /ai/calls, GET /platform/ai/keys), `platform-ai-access` (GET, PUT /platform/businesses/{id}/ai-access), `platform-ai-models` (GET, POST /platform/ai/models, PATCH /platform/ai/models/{id}, PUT /platform/ai/tasks/{taskId}/models) |
| `services/`     | `ai-calls` (what features call: picks models and keys, falls back, notes key health, records the call), `ai-access` (what one business may use right now), `ai-keys`, `key-tester`, `ai-settings`, `ai-models`, `ai-usage`, `ai-call-recorder`, `ai-call-log`, `platform-ai-access`, `platform-ai-models`, `platform-ai-keys`, `ai-health` (the checks), `ai-notices` (the warning emails)                                                          |
| `repositories/` | The SQL for `ai_models`, `ai_task_models`, `ai_keys`, `ai_settings`, `ai_calls`, `ai_usage`, `ai_platform_key_checks`, `ai_notices_sent`                                                                                                                                                                                                                                                                                                            |
| `helpers/`      | Pure rules: the job list, which models answer a job and in what order, which key sources a business may use, key-test findings, the secret box (AES-256-GCM), usage maths, model watching, the warning emails' wording                                                                                                                                                                                                                              |

**For other modules:** build the service once with `createAiService({ database, config, llm })` (from this module's `index.ts`) and call
`generateText` or `generateObject` with a `tag` (job, agent, channel, prompt version), the `accountId` and the prompt. Put the steady
part of the prompt in `stableSystemText` and what changes in `changingSystemText`, so the providers can cache the start.

**Jobs:** `ai.check_health` (nightly 02:15 UTC: platform keys, model list, retirement dates, then one `ai.check_business_keys` per
business), `ai.check_fallbacks` (hourly), `ai.clean_old_calls` (nightly 02:45 UTC: call records older than 90 days).

**Events** (ids and field names only): `ai.key_added`, `ai.key_removed`, `ai.settings_updated`, `ai.access_changed`.
