-- F15 slice 2: a manager can remove a CUSTOM conversation type. The system types can never be removed, and that is enforced
-- here too, not only in the service, so nothing that reaches the table can delete one.

GRANT DELETE ON app.conversation_types TO app_user;

CREATE FUNCTION app.refuse_to_delete_system_conversation_type() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'system_conversation_type_cannot_be_deleted' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER conversation_types_keep_system_types
  BEFORE DELETE ON app.conversation_types
  FOR EACH ROW EXECUTE FUNCTION app.refuse_to_delete_system_conversation_type();
