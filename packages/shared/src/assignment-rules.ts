import { z } from 'zod';

// The shape of "how new leads are shared out" between the API and the web app.

export const assignmentModeSchema = z.enum(['one_person', 'round_robin']);
export type AssignmentMode = z.infer<typeof assignmentModeSchema>;

/** The rule now. `userId` is who gets every new lead (one person); `roundRobinUserIds` are the people who take turns. */
export const assignmentRulesSchema = z.object({
  mode: assignmentModeSchema,
  userId: z.string().nullable(),
  /** In turn order. Empty unless the mode is round_robin. */
  roundRobinUserIds: z.array(z.string()),
});
export type AssignmentRules = z.infer<typeof assignmentRulesSchema>;

/**
 * What a manager sends to change the rule: either every new lead goes to one person, or a list of people take turns (at
 * least one, no repeats, in the order of their turns). Every person must work for the business. Sharing out by offering
 * arrives with the offerings feature (F17). Anything else in the body is refused.
 */
export const replaceAssignmentRulesRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('one_person'), userId: z.uuid() }).strict(),
  z
    .object({
      mode: z.literal('round_robin'),
      userIds: z
        .array(z.uuid())
        .min(1)
        .max(50)
        .refine((userIds) => new Set(userIds).size === userIds.length, 'Each person can appear only once'),
    })
    .strict(),
]);
export type ReplaceAssignmentRulesRequest = z.infer<typeof replaceAssignmentRulesRequestSchema>;
