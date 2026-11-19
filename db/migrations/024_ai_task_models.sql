-- F37, slice 1 (rework): a model order per JOB, and more facts about each model.
--
-- Migration 023 gave one global order of preference. Different jobs need different models (a tiny, fast one to sort a
-- conversation, a stronger one for the setup chat), so the order is now kept per job in `ai_task_models`. The developer
-- seeds it here (the preset); a platform admin edits it later from the console without any code change; a business can
-- override it (a later slice). Both tables are shared by every business: no account_id, read-only for the app role.

-- What kind of model it is, how big it is, whether its name is a moving one, and when the provider retires it.
ALTER TABLE app.ai_models
  ADD COLUMN kind       text    NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'voice')),
  ADD COLUMN size       text    NOT NULL DEFAULT 'small' CHECK (size IN ('small', 'medium', 'large')),
  -- A moving name (like gemini-flash-latest) is pointed at a newer model by the provider without notice.
  ADD COLUMN is_alias   boolean NOT NULL DEFAULT false,
  -- The date the provider retires the model, typed in by the admin from the provider's announcement (no provider API gives it).
  ADD COLUMN retires_on date;

-- Every model suits the two new email jobs for now (an admin edits this)
UPDATE app.ai_models SET tasks = tasks || '{analyse_email,draft_email}';

-- gemini-2.5-flash is no longer available to new Google projects (found with real keys, 13 Nov 2026)
UPDATE app.ai_models SET status = 'deprecated', size = 'medium' WHERE provider = 'gemini' AND model_name = 'gemini-2.5-flash';
UPDATE app.ai_models SET size = 'medium' WHERE model_name IN ('claude-sonnet-5-5');

-- The models found with the owner's keys that were not in the first list
INSERT INTO app.ai_models (provider, model_name, label, tasks, size, is_alias, sort_order) VALUES
  ('gemini', 'gemini-flash-lite-latest', 'Gemini Flash-Lite (latest)', '{classify_conversation,analyse_email,draft_email,chat_reply,summarise,setup_chat,extract_from_website}', 'small',  true,  5),
  ('gemini', 'gemini-flash-latest',      'Gemini Flash (latest)',      '{classify_conversation,analyse_email,draft_email,chat_reply,summarise,setup_chat,extract_from_website}', 'medium', true,  8),
  ('gemini', 'gemini-3.5-flash',         'Gemini 3.5 Flash',           '{classify_conversation,analyse_email,draft_email,chat_reply,summarise,setup_chat,extract_from_website}', 'medium', false, 25),
  ('gemini', 'gemini-3.8-flash',         'Gemini 3.8 Flash',           '{classify_conversation,analyse_email,draft_email,chat_reply,summarise,setup_chat,extract_from_website}', 'medium', false, 28);

CREATE TABLE app.ai_task_models (
  task      text    NOT NULL CHECK (task ~ '^[a-z][a-z0-9_]{1,59}$'),
  position  integer NOT NULL CHECK (position BETWEEN 1 AND 20),
  model_id  uuid    NOT NULL REFERENCES app.ai_models (id),
  PRIMARY KEY (task, position),
  UNIQUE (task, model_id)
);
REVOKE INSERT, UPDATE, DELETE ON app.ai_task_models FROM app_user;

-- The presets: for each job, the models to try in order. Small, quick models first for the simple jobs; a stronger one first
-- where the job reads a lot or talks for long. The deprecated gemini-2.5-flash goes last (it still works on some keys).
INSERT INTO app.ai_task_models (task, position, model_id)
SELECT preset.task, preset.position, model.id
FROM (VALUES
  ('classify_conversation', 1, 'gemini-flash-lite-latest'), ('classify_conversation', 2, 'gpt-4o-mini'),
  ('classify_conversation', 3, 'gemini-3.5-flash-lite'),    ('classify_conversation', 4, 'gemini-3.1-flash-lite'),
  ('classify_conversation', 5, 'gemini-2.5-flash'),

  ('analyse_email', 1, 'gemini-flash-lite-latest'), ('analyse_email', 2, 'gpt-4o-mini'),
  ('analyse_email', 3, 'gemini-3.5-flash-lite'),    ('analyse_email', 4, 'gemini-3.1-flash-lite'),
  ('analyse_email', 5, 'gemini-2.5-flash'),

  ('draft_email', 1, 'gpt-4o-mini'),               ('draft_email', 2, 'gemini-flash-lite-latest'),
  ('draft_email', 3, 'gemini-3.5-flash-lite'),     ('draft_email', 4, 'gemini-3.5-flash'),
  ('draft_email', 5, 'gemini-2.5-flash'),

  ('chat_reply', 1, 'gemini-flash-lite-latest'),   ('chat_reply', 2, 'gpt-4o-mini'),
  ('chat_reply', 3, 'gemini-3.5-flash-lite'),      ('chat_reply', 4, 'gemini-3.1-flash-lite'),
  ('chat_reply', 5, 'gemini-2.5-flash'),

  ('summarise', 1, 'gemini-flash-lite-latest'),    ('summarise', 2, 'gpt-4o-mini'),
  ('summarise', 3, 'gemini-3.5-flash-lite'),       ('summarise', 4, 'gemini-3.1-flash-lite'),
  ('summarise', 5, 'gemini-2.5-flash'),

  ('setup_chat', 1, 'gemini-3.5-flash'),           ('setup_chat', 2, 'gpt-4o-mini'),
  ('setup_chat', 3, 'gemini-flash-lite-latest'),   ('setup_chat', 4, 'gemini-flash-latest'),
  ('setup_chat', 5, 'gemini-2.5-flash'),

  ('extract_from_website', 1, 'gemini-3.5-flash'), ('extract_from_website', 2, 'gpt-4o-mini'),
  ('extract_from_website', 3, 'gemini-flash-lite-latest'), ('extract_from_website', 4, 'gemini-flash-latest'),
  ('extract_from_website', 5, 'gemini-2.5-flash')
) AS preset (task, position, model_name)
JOIN app.ai_models AS model ON model.model_name = preset.model_name;
