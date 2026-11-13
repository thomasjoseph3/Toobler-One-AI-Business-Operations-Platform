import type { Lead, PipelineStage } from '@toobler-one/shared';
import { ActionMenu, type ActionMenuItem } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';

export interface LeadRowMenuProps {
  lead: Lead;
  /** The name shown for the lead, used in the button's name ("More actions for Priya Menon"). */
  displayName: string;
  /** Every stage of the pipeline: the lead can be moved to any stage except the one it is in. */
  stages: readonly PipelineStage[];
  signedInUser: { id: string; role: string };
  onMoveToStage: (stage: PipelineStage) => void;
  onAssignToMe: () => void;
  onRemoveOwner: () => void;
  onDelete: () => void;
}

/**
 * The "…" menu of one lead: move it to another stage, take it or free it (the team list does not exist yet, so the owner can only be
 * "me" or nobody), and, for a manager, delete it. A member of staff never sees Delete (the API would refuse it anyway).
 */
export function LeadRowMenu({
  lead,
  displayName,
  stages,
  signedInUser,
  onMoveToStage,
  onAssignToMe,
  onRemoveOwner,
  onDelete,
}: LeadRowMenuProps) {
  const items: ActionMenuItem[] = stages
    .filter((stage) => stage.id !== lead.stage.id)
    .map((stage) => ({
      id: `move-${stage.id}`,
      label: stage.name,
      group: 'move',
      onSelect: () => onMoveToStage(stage),
    }));
  if (lead.ownerUserId !== signedInUser.id) {
    items.push({ id: 'assign-me', label: t('leads.menu.assignToMe'), group: 'owner', onSelect: onAssignToMe });
  }
  if (lead.ownerUserId !== null) {
    items.push({ id: 'remove-owner', label: t('leads.menu.removeOwner'), group: 'owner', onSelect: onRemoveOwner });
  }
  if (signedInUser.role === 'manager') {
    items.push({ id: 'delete', label: t('leads.menu.delete'), group: 'delete', tone: 'danger', onSelect: onDelete });
  }
  return (
    <ActionMenu
      triggerLabel={formatMessage('leads.row.more', { name: displayName })}
      panelLabel={formatMessage('leads.menu.panel', { name: displayName })}
      items={items}
      groupHeadings={{ move: t('leads.menu.moveTo'), owner: t('leads.menu.owner') }}
    />
  );
}
