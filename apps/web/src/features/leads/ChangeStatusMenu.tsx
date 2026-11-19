import type { Lead, PipelineStage } from '@toobler-one/shared';
import { ActionMenu, type ActionMenuItem } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';

/**
 * The "Change status" button of a lead's page (the designer's way to move a lead on a phone, where cards cannot be dragged): it
 * opens a short list of every status the lead is not in, and choosing one moves the lead (Lost asks why first, as everywhere).
 */
export function ChangeStatusMenu(props: {
  lead: Lead;
  displayName: string;
  /** Every stage of the pipeline. */
  stages: readonly PipelineStage[];
  onMoveToStage: (stage: PipelineStage) => void;
}) {
  const { lead, displayName, stages, onMoveToStage } = props;
  const items: ActionMenuItem[] = stages
    .filter((stage) => stage.id !== lead.stage.id)
    .map((stage) => ({ id: `status-${stage.id}`, label: stage.name, onSelect: () => onMoveToStage(stage) }));
  return (
    <ActionMenu
      triggerLabel={formatMessage('leadPage.changeStatusFor', { name: displayName })}
      triggerText={t('leadPage.changeStatus')}
      panelLabel={t('leadPage.changeStatus')}
      items={items}
    />
  );
}
