-- F37, slice 3: removing a key wipes the secret.
--
-- Migration 025 let business code add keys but never change the stored (scrambled) key. Removing a key should not leave the
-- scrambled key lying in the table, so removal now overwrites it with a placeholder that can never be unscrambled, and zeroes the
-- fingerprint (so the same key can be saved again later). To keep the old protection, the ONLY change anyone can make to the
-- scrambled key or the fingerprint is exactly this wipe, at the moment the key is removed: a trigger refuses everything else.

GRANT UPDATE (encrypted_key, key_fingerprint) ON app.ai_keys TO app_user;

CREATE FUNCTION app.ai_keys_allow_only_the_wipe() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.encrypted_key IS DISTINCT FROM OLD.encrypted_key OR NEW.key_fingerprint IS DISTINCT FROM OLD.key_fingerprint THEN
    IF NOT (
      OLD.deleted_at IS NULL
      AND NEW.deleted_at IS NOT NULL
      AND NEW.encrypted_key = 'v1.removed.removed.removed'
      AND NEW.key_fingerprint = repeat('0', 64)
    ) THEN
      RAISE EXCEPTION 'A saved key can only be changed by wiping it when it is removed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_keys_allow_only_the_wipe BEFORE UPDATE ON app.ai_keys
  FOR EACH ROW EXECUTE FUNCTION app.ai_keys_allow_only_the_wipe();
