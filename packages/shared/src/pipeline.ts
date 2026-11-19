import { z } from 'zod';

// The shape of the pipeline (the columns of the leads board) between the API and the web app.

/** What a stage means: open stages are in progress; Won and Lost close the lead. */
export const stageKindSchema = z.enum(['open', 'won', 'lost']);
export type StageKind = z.infer<typeof stageKindSchema>;

export const pipelineStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: stageKindSchema,
  /** Left to right on the board, starting at 0. Won and Lost are always the last two. */
  sort: z.number().int(),
  /** How many leads are in this stage now (deleted leads are not counted). */
  leadCount: z.number().int(),
});
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const pipelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** In board order, left to right. */
  stages: z.array(pipelineStageSchema),
});
export type Pipeline = z.infer<typeof pipelineSchema>;

/** What a manager sends to add a stage. The stage is always an open one; it goes just before Won. */
export const createStageRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the stage a name').max(60),
  })
  .strict();
export type CreateStageRequest = z.infer<typeof createStageRequestSchema>;

/** The address part naming a stage. */
export const stageIdParamsSchema = z.object({ id: z.uuid() });

/**
 * What a manager sends to rename a stage. Any stage can be renamed, Won and Lost included ("Booked" instead of "Won"): the
 * stage keeps its meaning (its kind), only the word changes.
 */
export const updateStageRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the stage a name').max(60),
  })
  .strict();
export type UpdateStageRequest = z.infer<typeof updateStageRequestSchema>;

/**
 * What a manager sends to reorder the board: the ids of ALL the open stages, in the new left-to-right order. Won and Lost
 * are not listed, because they always stay last. The API checks the list is exactly the business's open stages.
 */
export const reorderStagesRequestSchema = z
  .object({
    stageIds: z.array(z.uuid()).min(1).max(12),
  })
  .strict();
export type ReorderStagesRequest = z.infer<typeof reorderStagesRequestSchema>;

/**
 * The query part of removing a stage. `move_to` names the open stage that takes over the leads of the removed one. It is
 * required when the stage has leads, and is ignored when it has none.
 */
export const removeStageQuerySchema = z.object({ move_to: z.uuid().optional() });
export type RemoveStageQuery = z.infer<typeof removeStageQuerySchema>;
