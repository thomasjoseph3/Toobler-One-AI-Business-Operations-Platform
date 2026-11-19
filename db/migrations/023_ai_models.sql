-- F37, slice 1: the list of AI models the platform knows about.
--
-- A reference table shared by every business (like `industries`), so it has no account_id and is not fenced. The app role
-- (app_user) may READ it but never change it: only a platform admin edits the list (a platform-only route arrives in a
-- later slice). A model is a row, not code, so a new model or a new version is a new row, and a retired one is marked.
--
-- `tasks` lists the jobs a model suits (like classify_conversation or chat_reply). `sort_order` is the platform's order of
-- preference: for a job, the first model with a working key answers and the rest are its fallbacks.

CREATE TABLE app.ai_models (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text        NOT NULL CHECK (provider IN ('gemini', 'openai', 'anthropic')),
  model_name  text        NOT NULL CHECK (length(model_name) BETWEEN 1 AND 100),
  label       text        NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  tasks       text[]      NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'retired')),
  sort_order  integer     NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model_name)
);
CREATE TRIGGER ai_models_set_updated_at BEFORE UPDATE ON app.ai_models
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Migration 001 gives app_user full access to every new table by default; this one is read-only for it.
REVOKE INSERT, UPDATE, DELETE ON app.ai_models FROM app_user;

-- The starting list, taken from the hotel agent's working settings. Every model suits every job for now; an admin edits this.
INSERT INTO app.ai_models (provider, model_name, label, tasks, sort_order) VALUES
  ('gemini',    'gemini-2.5-flash',      'Gemini 2.5 Flash',      '{classify_conversation,chat_reply,summarise,setup_chat,extract_from_website}', 10),
  ('gemini',    'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', '{classify_conversation,chat_reply,summarise,setup_chat,extract_from_website}', 20),
  ('gemini',    'gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', '{classify_conversation,chat_reply,summarise,setup_chat,extract_from_website}', 30),
  ('openai',    'gpt-4o-mini',           'GPT-4o mini',           '{classify_conversation,chat_reply,summarise,setup_chat,extract_from_website}', 40),
  ('anthropic', 'claude-haiku-5-5',      'Claude Haiku 5.5',      '{classify_conversation,chat_reply,summarise,setup_chat,extract_from_website}', 50),
  ('anthropic', 'claude-sonnet-5-5',     'Claude Sonnet 5.5',     '{classify_conversation,chat_reply,summarise,setup_chat,extract_from_website}', 60);
