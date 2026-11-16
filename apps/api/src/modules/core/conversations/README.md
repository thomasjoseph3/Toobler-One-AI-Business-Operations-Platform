# core.conversations: sorting every conversation into a type

Built in slices of at most 2 API routes (see `docs/features/F15-conversation-types-and-router.md`; the design is
`docs/CONVERSATION-TYPES.md`).

| Folder          | What is in it                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routes/`       | `conversation-types.routes.ts`: `GET /conversation-types`, `POST /conversation-types`, `POST /conversation-types/test` (Try it), `POST /conversation-types/reorder`, `PATCH /conversation-types/{id}`, `DELETE /conversation-types/{id}`         |
| `routes/`       | `block-list.routes.ts`: `GET /block-list`, `PUT /block-list`                                                                                                                                           |
| `services/`     | `block-list.service.ts`: read and save the whole block list (a number as its digits, an email in lower case)                                                                                           |
| `services/`     | `conversation-types.service.ts`: list the business's types (giving a business its starting types the first time), add a custom type, change a type, put the types in a new order, remove a custom type |
| `repositories/` | `classification-corrections.repository.ts`: the SQL for `classification_corrections` |
| `repositories/` | `conversations.repository.ts`, `conversation-messages.repository.ts`, `conversation-outcomes.repository.ts`: the SQL for the conversation tables |
| `repositories/` | `block-list.repository.ts`: the SQL for `block_list`                                                                                                                                                   |
| `repositories/` | `conversation-types.repository.ts`: the SQL for `conversation_types`                                                                                                                                   |
| `helpers/`      | `pre-filter.ts`: the code-only rules run before any AI (silent call, empty chat, machine-made email, block list, own staff) (pure)                                                                     |
| `helpers/`      | `router.ts`: `decide`, which turns what the AI said into what to do (lead, ticket, log, Filtered, ignore, review), alerts, reuse of open records and the 0.70 / 0.40 thresholds (pure)                 |
| `helpers/`      | `default-conversation-types.ts`: the 13 system types and each industry's extras, and the key made from a label (pure)                                                                                  |

A **type** is one reason a person gets in touch (new enquiry, complaint, supplier, spam). Each type decides what happens next:
a lead, a ticket, a log line, the Filtered tab, nothing shown, or a person looks. Every business gets the 13 system types
(renamed or re-routed, never removed) plus its industry's extras; a manager can add more, up to 25 active. The starting types are
written the first time the list is read, so new and existing businesses are treated alike.

The built-in types can be renamed and re-routed but never switched off or removed (the router needs them as fallbacks).

The AI says what a conversation was about; code decides what to do about it (the router, slice 5).

**Public entry points (`index.ts`):** `createConversationRecordsService`, `createConversationFinaliser`, `createConversationClassifier`. **Job:** `conversations.sort_conversation` (a channel queues it with `accountId` and `conversationId` when a conversation ends). **Event:** `conversation.sorted` (ids and the type key, never the words).
