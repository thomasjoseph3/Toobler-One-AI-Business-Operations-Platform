import { z } from 'zod';

// The email connection of a business, between the API and the web app (docs/features/F26-email.md). The mailbox password is a secret: it goes in
// when saved and is never sent back, only its last four characters.

export const emailStatusSchema = z.enum(['unchecked', 'working', 'failed']);
export const emailReplyModeSchema = z.enum(['send', 'draft']);
export type EmailReplyMode = z.infer<typeof emailReplyModeSchema>;

/** What the screen shows when the business has connected a mailbox. */
export const emailConnectionSchema = z.object({
  address: z.string(),
  username: z.string(),
  imapHost: z.string(),
  imapPort: z.number(),
  smtpHost: z.string(),
  smtpPort: z.number(),
  /** "••••3f9a": enough to recognise the password, never enough to use it. */
  passwordPreview: z.string(),
  /** `send`: the AI sends its reply. `draft`: the AI writes it and a team member approves it first. */
  replyMode: emailReplyModeSchema,
  /** False while the business has paused reading the mailbox (the settings are kept). */
  readEmails: z.boolean(),
  status: emailStatusSchema,
  statusNote: z.string().nullable(),
  statusCheckedAt: z.string().nullable(),
  lastEmailAt: z.string().nullable(),
});
export type EmailConnection = z.infer<typeof emailConnectionSchema>;

export const emailSettingsSchema = z.object({ connection: emailConnectionSchema.nullable() });
export type EmailSettings = z.infer<typeof emailSettingsSchema>;

const hostText = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9.-]{1,198})[a-z0-9]$/, 'Write the server name, like imap.gmail.com');
const portNumber = z.number().int().min(1).max(65535);

/**
 * Connects a mailbox or changes the connection. The password is needed the first time; after that, leave it out to keep the saved one. Only what
 * is sent changes (after the first time). The IMAP port is always a TLS one (993); SMTP uses 465 (TLS) or 587.
 */
export const saveEmailConnectionRequestSchema = z
  .object({
    address: z.string().trim().toLowerCase().email('Write the mailbox address').max(200),
    username: z.string().trim().min(1).max(200).optional(),
    password: z.string().min(4, 'That password looks too short').max(500).optional(),
    imapHost: hostText.optional(),
    imapPort: portNumber.optional(),
    smtpHost: hostText.optional(),
    smtpPort: portNumber.optional(),
    replyMode: emailReplyModeSchema.optional(),
    readEmails: z.boolean().optional(),
  })
  .strict();
export type SaveEmailConnectionRequest = z.infer<typeof saveEmailConnectionRequestSchema>;

export const emailCheckResultSchema = z.object({
  ok: z.boolean(),
  note: z.string(),
  connection: emailConnectionSchema,
});
export type EmailCheckResult = z.infer<typeof emailCheckResultSchema>;

/** A reply the AI wrote that waits for a team member. */
export const emailDraftSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  toEmail: z.string(),
  subject: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;
export const emailDraftsResponseSchema = z.object({ items: z.array(emailDraftSchema) });
export type EmailDraftsResponse = z.infer<typeof emailDraftsResponseSchema>;

export const emailDraftIdParamsSchema = z.object({ id: z.string().uuid() });

/** Sends a waiting draft, optionally with the words changed first. */
export const sendEmailDraftRequestSchema = z
  .object({ body: z.string().trim().min(1, 'Write the reply').max(20000).optional() })
  .strict();
export type SendEmailDraftRequest = z.infer<typeof sendEmailDraftRequestSchema>;
