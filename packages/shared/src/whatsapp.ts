import { z } from 'zod';

// The WhatsApp connection of a business, between the API and the web app (docs/features/F25-whatsapp.md). The access token is a secret: it goes
// in when saved and is never sent back, only its last four characters.

export const whatsappStatusSchema = z.enum(['unchecked', 'working', 'failed']);
export type WhatsappStatus = z.infer<typeof whatsappStatusSchema>;

/** What the screen shows when the business has connected a number. */
export const whatsappConnectionSchema = z.object({
  /** Meta's id of the number customers write to. */
  phoneNumberId: z.string(),
  businessAccountId: z.string().nullable(),
  /** The number as customers see it, like +919847012345, or null when not known yet (a successful check fills it in). */
  displayPhoneNumber: z.string().nullable(),
  /** "••••3f9a": enough to recognise the token, never enough to use it. */
  tokenPreview: z.string(),
  /** False while the business has paused the AI's answers on WhatsApp (the settings are kept). */
  answerMessages: z.boolean(),
  status: whatsappStatusSchema,
  statusNote: z.string().nullable(),
  statusCheckedAt: z.string().nullable(),
  /** When a customer's message last arrived on this number, or null. */
  lastMessageAt: z.string().nullable(),
  /** A "chat with us" link for the business's website and cards, or null while the number is not known. */
  chatLink: z.string().nullable(),
});
export type WhatsappConnection = z.infer<typeof whatsappConnectionSchema>;

/** The whole screen: the connection (or null), and what the business needs to put into Meta's settings. */
export const whatsappSettingsSchema = z.object({
  connection: whatsappConnectionSchema.nullable(),
  /** The address to give Meta as the webhook, or null when the platform has not switched WhatsApp on (no app secret on the server). */
  webhookUrl: z.string().nullable(),
  /** The verify token to type into Meta, or null when the platform has not switched WhatsApp on. */
  verifyToken: z.string().nullable(),
  /** False when the server has no Meta app secret: messages cannot be trusted, so the webhook is off. */
  platformReady: z.boolean(),
});
export type WhatsappSettings = z.infer<typeof whatsappSettingsSchema>;

const idText = z
  .string()
  .trim()
  .regex(/^[0-9]{5,30}$/, 'Use the numeric id from Meta (digits only)');

/**
 * Connects a number or changes the connection. The token is needed the first time; after that, leave it out to keep the saved one.
 * Only what is sent changes.
 */
export const saveWhatsappConnectionRequestSchema = z
  .object({
    phoneNumberId: idText,
    businessAccountId: idText.nullable().optional(),
    accessToken: z.string().trim().min(10, 'That token looks too short').max(4000).optional(),
    answerMessages: z.boolean().optional(),
  })
  .strict();
export type SaveWhatsappConnectionRequest = z.infer<typeof saveWhatsappConnectionRequestSchema>;

/** The answer to "Check connection": what Meta said about the number. */
export const whatsappCheckResultSchema = z.object({
  ok: z.boolean(),
  /** A plain sentence for the screen: "Connected to Nair Stays (+91 98470 12345)" or what is wrong. */
  note: z.string(),
  connection: whatsappConnectionSchema,
});
export type WhatsappCheckResult = z.infer<typeof whatsappCheckResultSchema>;
