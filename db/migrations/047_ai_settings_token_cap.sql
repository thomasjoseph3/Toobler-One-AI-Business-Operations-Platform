-- A monthly TOKEN cap for the platform's AI keys, beside the call cap. The platform team sets it per business (null = no cap). Tokens
-- are what the AI companies charge for, so this is the cap that matters for demo and commercial use. It is counted from the
-- tokens already recorded per call (input + output, on the platform's keys). Like the other platform columns, business code
-- cannot change it (no grant is given to app_user).
ALTER TABLE app.ai_settings
  ADD COLUMN platform_monthly_token_cap bigint CHECK (platform_monthly_token_cap IS NULL OR platform_monthly_token_cap >= 0);
