-- F20 slice 2: a web chat starts without knowing who the visitor is, and learns the phone number or email during the chat.
--
-- Migration 035 deliberately kept `from_phone_key` and `from_email` unchangeable by business code ("never change who was on the other end"):
-- a phone call or a WhatsApp message knows its sender from the first moment. A web chat does not, so the chat channel must be able to fill
-- them in once the visitor has said them. The rule stays as strict as it can be: the repository only fills an EMPTY value (it never replaces
-- one), and the column grants still never allow the business, the channel or the start time to change.
GRANT UPDATE (from_phone_key, from_email) ON app.conversations TO app_user;

-- The database itself enforces "fill in, never replace": once a conversation has a phone or an email, no one (not even a bug in the code)
-- can change or clear it. The sorting reads these to make the contact, so who the conversation is with must never be swapped afterwards.
CREATE FUNCTION app.keep_conversation_sender() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.from_phone_key IS NOT NULL AND NEW.from_phone_key IS DISTINCT FROM OLD.from_phone_key THEN
    RAISE EXCEPTION 'The phone a conversation is with cannot be changed once it is known' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.from_email IS NOT NULL AND NEW.from_email IS DISTINCT FROM OLD.from_email THEN
    RAISE EXCEPTION 'The email a conversation is with cannot be changed once it is known' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_keep_sender BEFORE UPDATE ON app.conversations
  FOR EACH ROW EXECUTE FUNCTION app.keep_conversation_sender();
