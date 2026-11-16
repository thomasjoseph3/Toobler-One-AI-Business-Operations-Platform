import { z } from 'zod';

// The settings of the website chat bubble, between the API and the web app (docs/features/F20-website-chat.md). The bubble is the chat a
// visitor opens on the business's own website; its Call and WhatsApp buttons are plain links built from the two numbers.

export const webchatPositionSchema = z.enum(['bottom_right', 'bottom_left']);
export type WebchatPosition = z.infer<typeof webchatPositionSchema>;

/** The launcher's buttons. `chat` opens the chat window; `call` and `whatsapp` are links that need their number. */
export const webchatButtonSchema = z.enum(['chat', 'call', 'whatsapp']);
export type WebchatButton = z.infer<typeof webchatButtonSchema>;

/** The most websites one business may list. */
export const MOST_ALLOWED_WEBSITES = 20;

/** A colour as #RRGGBB. */
const colourSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a colour like #1F6FEB');

/** What the API shows: the settings, the key, the code to paste and "last seen". */
export const webchatSettingsSchema = z.object({
  /** What the page's code carries. Not a secret: the chat also checks the website it is on. */
  widgetKey: z.string(),
  colour: z.string(),
  greeting: z.string(),
  position: webchatPositionSchema,
  /** The websites the bubble may appear on, as addresses like https://nairstays.example. Empty means it works nowhere. */
  allowedWebsites: z.array(z.string()),
  /** International form like +919847012345, or null (the Call button is hidden). */
  phoneNumber: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  /** The text ready-typed when the visitor opens WhatsApp, or null. */
  whatsappMessage: z.string().nullable(),
  /** The buttons the business chose, in order. A button also needs its number to show (see `buttonsShown`). */
  buttonOrder: z.array(webchatButtonSchema),
  /** The buttons that really show: chosen, and (for call and WhatsApp) with a number set. */
  buttonsShown: z.array(webchatButtonSchema),
  /** The one line of code to paste into the website. */
  snippet: z.string(),
  /** Where and when the bubble was last seen working, or null when it has never been seen. */
  lastSeen: z.object({ website: z.string(), at: z.string() }).nullable(),
});
export type WebchatSettings = z.infer<typeof webchatSettingsSchema>;

/**
 * What a manager may change. Only what is sent changes. A website is written as the address of the site without a page
 * (`https://nairstays.example`); the API tidies it. A number is read like any phone number, in the business's own country when typed without one.
 * `null` clears a number or the ready-typed message.
 */
export const patchWebchatSettingsRequestSchema = z
  .object({
    colour: colourSchema.optional(),
    greeting: z
      .string()
      .trim()
      .min(1, 'Write a greeting')
      .max(200, 'Keep the greeting under 200 characters')
      .optional(),
    position: webchatPositionSchema.optional(),
    allowedWebsites: z.array(z.string().trim().min(1).max(300)).max(MOST_ALLOWED_WEBSITES).optional(),
    phoneNumber: z.string().trim().min(1).max(40).nullable().optional(),
    whatsappNumber: z.string().trim().min(1).max(40).nullable().optional(),
    whatsappMessage: z.string().trim().min(1).max(300).nullable().optional(),
    buttonOrder: z.array(webchatButtonSchema).min(1).max(3).optional(),
  })
  .strict();
export type PatchWebchatSettingsRequest = z.infer<typeof patchWebchatSettingsRequestSchema>;
