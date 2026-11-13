import { z } from 'zod';
import { aiKeyModeSchema } from './ai-settings';

// What the Toobler team decides about a business's use of the platform's AI keys: switched on or off, a cap on calls a month, an
// end date, and whether warning emails go out. Only platform admins reach these shapes.

/** The most calls a month the platform will ever allow a business, as a sanity limit on what an admin can type. */
export const MAX_PLATFORM_MONTHLY_CALL_CAP = 10_000_000;

/** A business's platform AI access, as a platform admin sees it. */
export const platformAiAccessSchema = z.object({
  businessId: z.string(),
  businessName: z.string(),
  /** The business's own choice of where its keys come from (read-only here). */
  keyMode: aiKeyModeSchema,
  /** Whether the business may use the platform's keys at all. */
  enabled: z.boolean(),
  /** Calls a month on the platform's keys, or null for no cap. */
  monthlyCallCap: z.number().int().nullable(),
  /** When the access ends, or null for no end date. */
  expiresAt: z.string().nullable(),
  /** Whether warning emails (key problems, retiring models) go out for this business. */
  noticesEnabled: z.boolean(),
  /** How many keys of its own the business has saved. */
  ownKeyCount: z.number().int(),
});
export type PlatformAiAccess = z.infer<typeof platformAiAccessSchema>;

/** What a platform admin sends to change a business's access: any of the fields. `null` clears the cap or the end date. */
export const updateAiAccessRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    monthlyCallCap: z.number().int().min(0).max(MAX_PLATFORM_MONTHLY_CALL_CAP).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    noticesEnabled: z.boolean().optional(),
  })
  .strict();
export type UpdateAiAccessRequest = z.infer<typeof updateAiAccessRequestSchema>;
