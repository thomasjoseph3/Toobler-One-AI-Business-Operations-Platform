# core.fields: custom fields

Built in slices of at most 2 API routes (see `docs/features/F09-custom-fields.md`).

| Folder          | What is in it                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `routes/`       | `fields.routes.ts`: `GET /fields`, `POST /fields`, `PATCH /fields/{id}`, `DELETE /fields/{id}`                                                                       |
| `services/`     | `fields.service.ts`: list, add, change and remove (archive) fields (the key is made from the label and never reused; at most 50 live fields per object) |
| `repositories/` | `field-definitions.repository.ts`: the SQL for `field_definitions`                                                            |
| `helpers/`      | (later slices)                                                                                                                |

A field has an object (contact, company or lead), a key, a label, a type (text, number, date, dropdown, yes/no, phone, email), choices for a
dropdown, "the AI should ask" and (leads only) "required before Won". The one check for a saved value is `validateCustomValues` in
`packages/shared/src/custom-fields.ts`, used by the API and the AI's tools alike.
