import { useState } from 'react';
import type { Offering } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { moveId } from './list-helpers';
import { describeChangeProblem } from './problem-message';

/**
 * Everything the business sells, in the order the AI lists it. A manager can add, change, switch on or off, move up or down, and delete
 * (after "Are you sure?" naming it). Staff only read. Switched-off items are shown greyed: the AI never mentions them.
 */
export function OfferingsCard(props: {
  offerings: readonly Offering[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (offering: Offering) => void;
  onChanged: () => void;
}) {
  const { offerings, canEdit, onAdd, onEdit, onChanged } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Offering | null>(null);

  const run = async (offeringId: string, action: () => Promise<unknown>) => {
    setBusyId(offeringId);
    setProblem(null);
    try {
      await action();
      onChanged();
    } catch (error) {
      setProblem(describeChangeProblem(error));
    } finally {
      setBusyId(null);
    }
  };

  const switchActive = (offering: Offering) =>
    run(offering.id, () => apiRequest('PATCH', `/offerings/${offering.id}`, { active: !offering.active }));
  const move = (offering: Offering, direction: 'up' | 'down') =>
    run(offering.id, () => apiRequest('POST', '/offerings/reorder', { offeringIds: moveId(offerings.map((item) => item.id), offering.id, direction) }));
  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    await run(target.id, () => apiRequest('DELETE', `/offerings/${target.id}`));
    setToDelete(null);
  };

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading-sm text-text-primary">{t('whatYouSell.offerings.title')}</h2>
        {canEdit ? (
          <Button variant="primary" size="compact" onClick={onAdd}>
            {t('whatYouSell.offerings.add')}
          </Button>
        ) : null}
      </div>
      {problem ? <Alert tone="error" className="mb-3">{problem}</Alert> : null}
      {offerings.length === 0 ? (
        <EmptyState icon={<span aria-hidden>🛍</span>} title={t('whatYouSell.offerings.empty.title')} description={t('whatYouSell.offerings.empty.description')} />
      ) : (
        <ul>
          {offerings.map((offering, position) => (
            <li key={offering.id} className="flex flex-col gap-2 border-b border-border-default py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className={`text-label-md ${offering.active ? 'text-text-primary' : 'text-text-secondary'}`}>{offering.name}</h3>
                <Badge tone={offering.active ? 'success' : 'neutral'}>{t(offering.active ? 'whatYouSell.offerings.on' : 'whatYouSell.offerings.off')}</Badge>
              </div>
              <p className="text-body-md text-text-primary">{offering.priceInWords ?? t('whatYouSell.offerings.noPrice')}</p>
              {offering.description ? <p className="text-body-md text-text-secondary">{offering.description}</p> : null}
              {offering.includes ? <p className="text-body-md text-text-secondary">{formatMessage('whatYouSell.offerings.includes', { text: offering.includes })}</p> : null}
              {offering.seasonNote ? <p className="text-body-md text-text-secondary">{formatMessage('whatYouSell.offerings.season', { text: offering.seasonNote })}</p> : null}
              {offering.details.length > 0 ? (
                <dl className="text-body-md grid grid-cols-[auto_1fr] gap-x-3 text-text-secondary">
                  {offering.details.map((detail) => (
                    <div key={detail.label} className="contents">
                      <dt>{detail.label}</dt>
                      <dd className="text-text-primary">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="compact" disabled={busyId === offering.id} onClick={() => onEdit(offering)} aria-label={formatMessage('whatYouSell.offerings.edit', { name: offering.name })}>
                    {t('whatYouSell.offerings.editButton')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="compact"
                    disabled={busyId === offering.id}
                    onClick={() => switchActive(offering)}
                    aria-label={formatMessage(offering.active ? 'whatYouSell.offerings.switchOff' : 'whatYouSell.offerings.switchOn', { name: offering.name })}
                  >
                    {t(offering.active ? 'whatYouSell.offerings.switchOffButton' : 'whatYouSell.offerings.switchOnButton')}
                  </Button>
                  <Button variant="tertiary" size="compact" disabled={busyId === offering.id || position === 0} onClick={() => move(offering, 'up')} aria-label={formatMessage('whatYouSell.offerings.moveUp', { name: offering.name })}>
                    ↑
                  </Button>
                  <Button variant="tertiary" size="compact" disabled={busyId === offering.id || position === offerings.length - 1} onClick={() => move(offering, 'down')} aria-label={formatMessage('whatYouSell.offerings.moveDown', { name: offering.name })}>
                    ↓
                  </Button>
                  <Button variant="destructive" size="compact" disabled={busyId === offering.id} onClick={() => setToDelete(offering)} aria-label={formatMessage('whatYouSell.offerings.delete', { name: offering.name })}>
                    {t('whatYouSell.offerings.deleteButton')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={toDelete !== null}
        title={toDelete ? formatMessage('whatYouSell.offerings.deleteTitle', { name: toDelete.name }) : ''}
        description={t('whatYouSell.offerings.deleteDescription')}
        confirmLabel={t('whatYouSell.offerings.deleteConfirm')}
        cancelLabel={t('whatYouSell.form.cancel')}
        closeLabel={t('whatYouSell.form.close')}
        tone="danger"
        isConfirming={busyId !== null && toDelete !== null && busyId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
