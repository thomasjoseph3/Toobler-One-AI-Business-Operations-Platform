-- F15 slice 1 (hardening): a business can have at most 25 ACTIVE conversation types, so the classifier's instructions stay
-- small and accurate. The service already checks this to give a friendly answer, but a check in code alone can be beaten
-- by two requests at the same moment. This rule lives in the database, where it cannot be skipped.
--
-- The advisory lock makes two requests for the same business wait for each other (it is released when the transaction
-- ends), so both cannot count 24 and both add one. The count leaves out the row being written, so editing a type that is
-- already active never trips the limit.

CREATE FUNCTION app.enforce_active_conversation_types_limit() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('conversation_types_limit:' || NEW.account_id::text, 0));
  SELECT count(*) INTO active_count
  FROM app.conversation_types
  WHERE account_id = NEW.account_id AND is_active AND id <> NEW.id;
  IF active_count >= 25 THEN
    RAISE EXCEPTION 'too_many_active_conversation_types' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Only when the row is (or becomes) active: adding an active type, or switching one on
CREATE TRIGGER conversation_types_active_limit
  BEFORE INSERT OR UPDATE OF is_active ON app.conversation_types
  FOR EACH ROW WHEN (NEW.is_active)
  EXECUTE FUNCTION app.enforce_active_conversation_types_limit();
