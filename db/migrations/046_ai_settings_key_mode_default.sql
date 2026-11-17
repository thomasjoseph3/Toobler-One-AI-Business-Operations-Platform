-- Owner decision (17 Nov 2026): a business is no longer asked which keys to use. The rule is fixed: its own keys first, then the
-- platform's keys if the platform team has switched them on for it. The platform team alone decides the platform's part.
-- So every business, new and existing, uses own_then_platform. (The key_mode column stays; the API names do not change.)
ALTER TABLE app.ai_settings ALTER COLUMN key_mode SET DEFAULT 'own_then_platform';
UPDATE app.ai_settings SET key_mode = 'own_then_platform' WHERE key_mode <> 'own_then_platform';
