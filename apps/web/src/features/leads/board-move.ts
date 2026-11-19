// Moving a lead between the columns of the Pipeline board on screen, before the server has answered (an "optimistic" move).
// Pure: it never changes the columns it is given, it returns new ones. The server stays the source of truth: the screen asks it in the
// background and puts the card back if the server says no.
import type { BoardColumn } from '@toobler-one/shared';

/**
 * The columns after a lead moves to another column: the card leaves its old column (that count goes down), and appears at the top of the
 * new column with its stage changed (that count goes up). Unchanged when the lead is not on the board, the target column does not exist,
 * or the lead is already in that column.
 */
export function moveLeadInColumns(
  columns: readonly BoardColumn[],
  leadId: string,
  targetStageId: string,
): BoardColumn[] {
  const sourceColumn = columns.find((column) => column.leads.some((candidate) => candidate.id === leadId));
  const targetColumn = columns.find((column) => column.stage.id === targetStageId);
  const leadToMove = sourceColumn?.leads.find((candidate) => candidate.id === leadId);
  if (!sourceColumn || !targetColumn || !leadToMove || sourceColumn.stage.id === targetColumn.stage.id)
    return [...columns];

  const movedLead = {
    ...leadToMove,
    stage: { id: targetColumn.stage.id, name: targetColumn.stage.name, kind: targetColumn.stage.kind },
  };
  return columns.map((column) => {
    if (column.stage.id === sourceColumn.stage.id) {
      return {
        ...column,
        leadCount: Math.max(0, column.leadCount - 1),
        leads: column.leads.filter((candidate) => candidate.id !== leadId),
      };
    }
    if (column.stage.id === targetColumn.stage.id) {
      return { ...column, leadCount: column.leadCount + 1, leads: [movedLead, ...column.leads] };
    }
    return column;
  });
}
