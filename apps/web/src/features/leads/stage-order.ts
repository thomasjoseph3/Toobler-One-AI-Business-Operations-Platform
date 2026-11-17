// The rule for moving a column left or right, kept apart from the screen so it can be tested on its own.
import type { PipelineStage } from '@toobler-one/shared';

export type ColumnDirection = 'left' | 'right';

/** The ids of the open stages (not Won or Lost), in board order. The API wants exactly this list, reordered. */
export function listOpenStageIdsInOrder(stages: readonly PipelineStage[]): string[] {
  return stages
    .filter((stage) => stage.kind === 'open')
    .sort((first, second) => first.sort - second.sort)
    .map((stage) => stage.id);
}

/**
 * The open stage ids in the new order after moving one stage a place left or right, or null when it cannot move that way (it
 * is already first or last, or it is not an open stage: Won and Lost always stay last).
 */
export function moveStageInOrder(
  openStageIdsInOrder: readonly string[],
  stageId: string,
  direction: ColumnDirection,
): string[] | null {
  const position = openStageIdsInOrder.indexOf(stageId);
  if (position === -1) return null;
  const newPosition = direction === 'left' ? position - 1 : position + 1;
  if (newPosition < 0 || newPosition >= openStageIdsInOrder.length) return null;
  const reordered = [...openStageIdsInOrder];
  reordered[position] = openStageIdsInOrder[newPosition]!;
  reordered[newPosition] = stageId;
  return reordered;
}
