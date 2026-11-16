# core.conversations: sorting every conversation into a type

Built in slices of at most 2 API routes (see `docs/features/F15-conversation-types-and-router.md`; the design is
`docs/CONVERSATION-TYPES.md`).

| Folder | What is in it |
| --- | --- |
| `routes/` | `conversation-types.routes.ts`: `GET /conversation-types`, `POST /conversation-types` |
| `services/` | `conversation-types.service.ts`: list the business's types (giving a business its starting types the first time), add a custom type |
| `repositories/` | `conversation-types.repository.ts`: the SQL for `conversation_types` |
| `helpers/` | `default-conversation-types.ts`: the 13 system types and each industry's extras, and the key made from a label (pure) |

A **type** is one reason a person gets in touch (new enquiry, complaint, supplier, spam). Each type decides what happens next:
a lead, a ticket, a log line, the Filtered tab, nothing shown, or a person looks. Every business gets the 13 system types
(renamed or re-routed, never removed) plus its industry's extras; a manager can add more, up to 25 active. The starting types are
written the first time the list is read, so new and existing businesses are treated alike.

The AI says what a conversation was about; code decides what to do about it (the router, slice 5).
