# channel.webchat: the website chat

Built in slices of at most 2 API routes (see `docs/features/F20-website-chat.md`). A channel module: switched on per business, plug and play.

| Folder          | What is in it                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`       | `webchat-settings.routes.ts`: `GET /channels/webchat`, `PATCH /channels/webchat`                                                                                                      |
| `services/`     | `webchat-settings.service.ts`: read the settings (making them the first time, with a new widget key and no allowed website), change them (tidies websites and numbers)                |
| `repositories/` | `webchat-settings.repository.ts`: the SQL for `webchat_settings`                                                                                                                      |
| `helpers/`      | `widget-key.ts` (make and recognise a key), `website-origin.ts` (tidy a typed website, check a request's website), `describe-webchat-settings.ts` (buttons, the code to paste) (pure) |

The widget key is what a visitor's browser knows about the business. It is not a secret, so every public call is also checked against the websites the business listed.
