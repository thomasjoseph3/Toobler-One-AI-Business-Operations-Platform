-- F12: contacts made by an import are marked "Imported" (the requirement: they are never sent marketing messages without consent, in Phase 4).
-- The mark is the moment the import made the contact. A contact that already existed and was only updated by an import is not marked.

ALTER TABLE app.contacts ADD COLUMN imported_at timestamptz;
GRANT INSERT (imported_at) ON app.contacts TO app_user;
GRANT UPDATE (imported_at) ON app.contacts TO app_user;
