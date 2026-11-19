# channel.whatsapp: WhatsApp

Customers write to the business's WhatsApp number; the AI agent answers. See `docs/features/F25-whatsapp.md`. A channel module: switched on per business, plug and play.

| Folder          | What is in it                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/`       | `whatsapp-settings.routes.ts` (`GET/PUT/DELETE /channels/whatsapp`, `POST /channels/whatsapp/check`), `whatsapp-webhook.routes.ts` (Meta's `GET/POST /webhooks/whatsapp`, outside `/api/v1`) |
| `services/`     | connection settings, the inbound answer (message → agent → reply), the staff reply sender, the idle-conversation ender                                                                       |
| `repositories/` | the SQL for `whatsapp_connections` and `channel_message_receipts`                                                                                                                            |
| `helpers/`      | signature check, Meta delivery reader, WhatsApp text and the 24-hour rule, the idle rule (pure)                                                                                              |

The Meta app secret and verify token belong to the platform (`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`); each business saves its own number id and access token (scrambled).
