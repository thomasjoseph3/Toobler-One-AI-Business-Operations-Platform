import { z } from 'zod';

// The shape of the lost reasons (the choices in the "Lost" dialog) between the API and the web app.

export const lostReasonSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** Top to bottom in the dialog, starting at 0. */
  sort: z.number().int(),
});
export type LostReason = z.infer<typeof lostReasonSchema>;

export const lostReasonsResponseSchema = z.object({ items: z.array(lostReasonSchema) });
export type LostReasonsResponse = z.infer<typeof lostReasonsResponseSchema>;

/**
 * What a manager sends to replace the whole list: the labels, in the order the dialog should show them. At least one is
 * needed, because a lead can only be lost with a reason. Two labels cannot match, ignoring capitals (checked by the API).
 */
export const replaceLostReasonsRequestSchema = z
  .object({
    reasons: z.array(z.string().trim().min(1, 'A reason cannot be empty').max(80)).min(1).max(20),
  })
  .strict();
export type ReplaceLostReasonsRequest = z.infer<typeof replaceLostReasonsRequestSchema>;
