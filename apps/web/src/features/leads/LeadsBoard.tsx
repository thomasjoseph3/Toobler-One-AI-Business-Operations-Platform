import { useState, type ReactNode } from 'react';
import type { BoardColumn, Lead, PipelineStage } from '@toobler-one/shared';
import { ActionMenu, type ActionMenuItem, ActivityIcon, Button, CalendarIcon, IconButton, PhoneIcon, PlusIcon, Tag } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { listOpenStageIdsInOrder, moveStageInOrder, type ColumnDirection } from './stage-order';
import { LeadNameLink } from './LeadNameLink';
import {
  findChannelLabel,
  findLeadDisplayName,
  findOwnerLabel,
  findStageTagTone,
  formatCallbackDate,
} from './lead-display';

export interface LeadsBoardProps {
  /** One column per stage, in pipeline order (from `GET /leads?view=board`). */
  columns: readonly BoardColumn[];
  signedInUserId: string;
  /** The business's time zone, for the callback dates. */
  timeZone: string;
  /** Every stage of the pipeline, to find the stage a card is dropped on. */
  stages: readonly PipelineStage[];
  /** Draws the "…" menu of one lead (move to another stage, take it, delete). Shown from tablet up: on a phone a card is opened and "Change status" is used. */
  renderRowMenu: (lead: Lead, displayName: string) => ReactNode;
  /** Moves a lead to a stage: called when a card is dropped on another column (Lost asks why first). */
  onMoveLead: (lead: Lead, displayName: string, stage: PipelineStage) => void;
  /** Whether the signed-in person may change the columns (managers only): shows the column menu and the Add column button. */
  canEditColumns: boolean;
  /** Opens the box to rename a column. */
  onRenameColumn: (stage: PipelineStage) => void;
  /** Opens the box to add a column. */
  onAddColumn: () => void;
  /** Moves a column one place left or right (open columns only; Won and Lost stay last). */
  onMoveColumn: (stage: PipelineStage, direction: ColumnDirection) => void;
  /** Opens the "Are you sure?" for deleting a column (open columns only). */
  onDeleteColumn: (stage: PipelineStage) => void;
}

/** One lead as a card (Figma pipeline card): name and menu, the source and the phone, the owner, and the callback date or the activity shortcut. */
function LeadCard({
  lead,
  signedInUserId,
  timeZone,
  renderRowMenu,
  onDragStart,
  onDragEnd,
}: { lead: Lead; onDragStart: (lead: Lead) => void; onDragEnd: () => void } & Pick<LeadsBoardProps, 'signedInUserId' | 'timeZone' | 'renderRowMenu'>) {
  const displayName = findLeadDisplayName(lead.contact);
  const callbackDate = formatCallbackDate(lead.callbackAt, timeZone);
  return (
    <li
      // A card can be dragged to another column on a computer; on a phone it is tapped to open (the whole card is the link)
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', lead.id);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(lead);
      }}
      onDragEnd={onDragEnd}
      className="relative flex cursor-grab flex-col gap-2 rounded-lg border border-border-subtle bg-surface p-3 shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-body-md-semibold min-w-0 break-words text-text-primary">
          <LeadNameLink lead={lead} className="max-md:after:absolute max-md:after:inset-0">
            {displayName}
          </LeadNameLink>
        </p>
        <span className="hidden md:block">{renderRowMenu(lead, displayName)}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-xs rounded-sm bg-hover px-2 py-1 text-text-secondary">
          {findChannelLabel(lead.firstChannel)}
        </span>
        {lead.contact?.phone ? (
          <span className="text-body-xs flex items-center gap-1.5 text-text-secondary">
            <PhoneIcon size={14} />
            {lead.contact.phone}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <p className="text-body-xs text-text-secondary">
          {t('leads.board.owner')}:{' '}
          <span className="text-body-xs-medium text-text-primary">
            {findOwnerLabel(lead.ownerUserId, signedInUserId)}
          </span>
        </p>
        {callbackDate ? (
          <span className="text-label-xs inline-flex items-center gap-1 rounded-sm bg-success-bg px-2 py-1 text-success">
            <CalendarIcon size={14} />
            {callbackDate}
          </span>
        ) : (
          // Logging an activity needs notes and tasks (F07, F08): drawn as designed, not working yet
          <IconButton
            label={t('leads.row.logActivity')}
            size="compact"
            icon={<ActivityIcon size={18} />}
            aria-disabled
            title={t('leads.notYet')}
          />
        )}
      </div>
    </li>
  );
}

/** The choices in one column's "…" menu: rename for every column; move left, move right and delete only for open columns (Won and Lost always stay last and cannot be removed). */
function buildColumnMenuItems(
  columnStage: BoardColumn['stage'],
  stages: readonly PipelineStage[],
  openStageIdsInOrder: readonly string[],
  actions: Pick<LeadsBoardProps, 'onRenameColumn' | 'onMoveColumn' | 'onDeleteColumn'>,
): ActionMenuItem[] {
  const stage = stages.find((candidate) => candidate.id === columnStage.id);
  if (stage === undefined) return [];
  const items: ActionMenuItem[] = [{ id: 'rename', label: t('pipeline.rename.title'), onSelect: () => actions.onRenameColumn(stage) }];
  if (stage.kind !== 'open') return items;
  if (moveStageInOrder(openStageIdsInOrder, stage.id, 'left') !== null) {
    items.push({ id: 'left', label: t('pipeline.moveLeft'), onSelect: () => actions.onMoveColumn(stage, 'left') });
  }
  if (moveStageInOrder(openStageIdsInOrder, stage.id, 'right') !== null) {
    items.push({ id: 'right', label: t('pipeline.moveRight'), onSelect: () => actions.onMoveColumn(stage, 'right') });
  }
  // The last open column cannot be deleted: a pipeline needs at least one
  if (openStageIdsInOrder.length > 1) {
    items.push({ id: 'delete', label: t('pipeline.delete.menu'), group: 'delete', tone: 'danger', onSelect: () => actions.onDeleteColumn(stage) });
  }
  return items;
}

/**
 * The Pipeline view (Figma "Leads Pipeline"): a board with one column per stage, side by side. Each column has the stage's tag
 * with how many leads it holds, and its newest leads as cards (up to 50: if there are more, it says so). The board scrolls
 * sideways when the stages do not fit, and each column scrolls up and down on its own, so the toolbar above stays in view.
 */
export function LeadsBoard({ columns, signedInUserId, timeZone, stages, renderRowMenu, onMoveLead, canEditColumns, onRenameColumn, onAddColumn, onMoveColumn, onDeleteColumn }: LeadsBoardProps) {
  const openStageIdsInOrderForMoves = listOpenStageIdsInOrder(stages);
  // The card being dragged and the column it is over, so the column can show where it would land
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [columnUnderCard, setColumnUnderCard] = useState<string | null>(null);
  const stopDragging = () => {
    setDraggedLead(null);
    setColumnUnderCard(null);
  };
  // A card dropped on a column moves the lead there, unless it is already in that column
  const dropOnColumn = (stageId: string) => {
    const lead = draggedLead;
    const stage = stages.find((candidate) => candidate.id === stageId);
    stopDragging();
    if (lead === null || stage === undefined || lead.stage.id === stageId) return;
    onMoveLead(lead, findLeadDisplayName(lead.contact), stage);
  };
  const openStageIdsInOrder = columns.filter((column) => column.stage.kind === 'open').map((column) => column.stage.id);
  return (
    <div
      role="list"
      aria-label={t('leads.board.columnsLabel')}
      className="flex min-h-[420px] flex-1 snap-x gap-4 overflow-x-auto pb-2 md:min-h-0"
    >
      {columns.map((column) => (
        <section
          role="listitem"
          key={column.stage.id}
          aria-label={column.stage.name}
          onDragOver={(event) => {
            // Needed so the column accepts a drop
            if (draggedLead === null) return;
            event.preventDefault();
            setColumnUnderCard(column.stage.id);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setColumnUnderCard(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dropOnColumn(column.stage.id);
          }}
          className={`flex w-[296px] shrink-0 snap-start flex-col rounded-xl border bg-surface-subtle p-3 ${
            columnUnderCard === column.stage.id && draggedLead?.stage.id !== column.stage.id
              ? 'border-action ring-2 ring-action'
              : 'border-border-subtle'
          }`}
        >
          <header className="mb-3 flex items-center justify-between gap-2">
            <Tag tone={findStageTagTone(column.stage, openStageIdsInOrder)}>
              {column.stage.name}
              <span aria-hidden className="text-label-xs ml-2 rounded-full bg-surface px-1.5 text-text-primary">
                {column.leadCount}
              </span>
              <span className="sr-only">{formatMessage('leads.board.count', { count: column.leadCount })}</span>
            </Tag>
            {canEditColumns ? (
              <ActionMenu
                triggerLabel={formatMessage('leads.board.columnMore', { stage: column.stage.name })}
                panelLabel={formatMessage('leads.board.columnMenu', { stage: column.stage.name })}
                items={buildColumnMenuItems(column.stage, stages, openStageIdsInOrderForMoves, { onRenameColumn, onMoveColumn, onDeleteColumn })}
              />
            ) : null}
          </header>
          {column.leads.length === 0 ? (
            <p className="text-body-sm px-1 text-text-tertiary">
              {columnUnderCard === column.stage.id && draggedLead !== null ? t('leads.board.dropHere') : t('leads.board.empty')}
            </p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {column.leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  signedInUserId={signedInUserId}
                  timeZone={timeZone}
                  renderRowMenu={renderRowMenu}
                  onDragStart={setDraggedLead}
                  onDragEnd={stopDragging}
                />
              ))}
            </ul>
          )}
          {column.hasMore ? (
            <p className="text-body-xs mt-3 text-text-secondary">
              {formatMessage('leads.board.hasMore', { shown: column.leads.length, total: column.leadCount })}
            </p>
          ) : null}
        </section>
      ))}
      {canEditColumns ? (
        <div className="flex w-[296px] shrink-0 snap-start items-start">
          <Button leadingIcon={<PlusIcon size={16} />} onClick={onAddColumn}>
            {t('pipeline.add.title')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
