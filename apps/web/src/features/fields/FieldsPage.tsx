import { useState } from 'react';
import type { FieldDefinition, FieldObject, FieldsListResponse } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ConfirmDialog, ErrorState, LoadingState, SegmentedControl } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { moveId } from '../what-you-sell/list-helpers';
import { SettingsTabs } from '../settings/SettingsTabs';
import { FieldFormPanel } from './FieldFormPanel';
import { describeFieldProblem, describeFieldType, FIELD_OBJECT_CHOICES } from './fields-state';

/**
 * Settings → Fields (managers only): the custom fields of contacts, companies and leads, one tab each, with an Add field button that opens the
 * form. Each field shows its type, its choices, and whether the AI asks for it and whether it is required before Won. Loading, error and empty
 * states; keeps what is on screen while it reloads.
 */
export function FieldsPage() {
  const resource = useApiResource<FieldsListResponse>('/fields');
  const data = useKeptData(resource.state);
  const [object, setObject] = useState<FieldObject>('contact');
  const [isAdding, setIsAdding] = useState(false);
  const [fieldBeingChanged, setFieldBeingChanged] = useState<FieldDefinition | null>(null);
  const [fieldToRemove, setFieldToRemove] = useState<FieldDefinition | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeProblem, setRemoveProblem] = useState<string | null>(null);

  // Moves one field a place up or down by sending the whole new order for this tab's object, then reloads the list
  async function moveField(field: FieldDefinition, direction: 'up' | 'down') {
    if (!data.data) return;
    const orderedIds = moveId(
      data.data.items.filter((candidate) => candidate.object === field.object).map((candidate) => candidate.id),
      field.id,
      direction,
    );
    setIsMoving(true);
    setRemoveProblem(null);
    try {
      await apiRequest('POST', '/fields/reorder', { object: field.object, ids: orderedIds });
      resource.reload();
    } catch (error) {
      setRemoveProblem(describeFieldProblem(error));
    } finally {
      setIsMoving(false);
    }
  }

  // Removes the field the person confirmed, then reloads the list; says what went wrong when it fails
  async function confirmRemove() {
    if (!fieldToRemove) return;
    setIsRemoving(true);
    setRemoveProblem(null);
    try {
      await apiRequest('DELETE', `/fields/${fieldToRemove.id}`);
      setNotice(formatMessage('fields.removed', { label: fieldToRemove.label }));
      setFieldToRemove(null);
      resource.reload();
    } catch (error) {
      setRemoveProblem(describeFieldProblem(error));
      setFieldToRemove(null);
    } finally {
      setIsRemoving(false);
    }
  }

  if (data.isFirstLoad) return <LoadingState label={t('fields.loading')} />;
  if (data.hasFailed || data.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('fields.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={resource.reload}>
              {t('team.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  const fieldsOfObject = data.data.items.filter((field) => field.object === object);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsTabs />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-body-md max-w-prose text-text-secondary">{t('fields.intro')}</p>
        <Button variant="primary" onClick={() => setIsAdding(true)}>
          {t('fields.add')}
        </Button>
      </div>
      <SegmentedControl<FieldObject>
        ariaLabel={t('fields.objectsLabel')}
        value={object}
        onChange={setObject}
        options={FIELD_OBJECT_CHOICES.map((choice) => ({ value: choice.object, label: t(choice.labelKey) }))}
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {removeProblem ? <Alert tone="error">{removeProblem}</Alert> : null}
      <Card>
        {fieldsOfObject.length === 0 ? <p className="text-body-md text-text-secondary">{t('fields.empty')}</p> : null}
        <ul>
          {fieldsOfObject.map((field, position) => (
            <li key={field.id} className="flex flex-col gap-1 border-b border-border-default py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-label-md text-text-primary">{field.label}</h3>
                <Badge tone="neutral">{describeFieldType(field.type)}</Badge>
                {field.aiAsks ? <Badge tone="info">{t('fields.badge.aiAsks')}</Badge> : null}
                {field.requiredForWon ? <Badge tone="warning">{t('fields.badge.requiredForWon')}</Badge> : null}
              </div>
              {field.options.length > 0 ? (
                <p className="text-body-sm text-text-secondary">
                  {formatMessage('fields.options', { options: field.options.join(', ') })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="tertiary"
                  size="compact"
                  disabled={isMoving || position === 0}
                  aria-label={formatMessage('fields.moveUp', { label: field.label })}
                  onClick={() => void moveField(field, 'up')}
                >
                  ↑
                </Button>
                <Button
                  variant="tertiary"
                  size="compact"
                  disabled={isMoving || position === fieldsOfObject.length - 1}
                  aria-label={formatMessage('fields.moveDown', { label: field.label })}
                  onClick={() => void moveField(field, 'down')}
                >
                  ↓
                </Button>
                <Button
                  size="compact"
                  aria-label={formatMessage('fields.change', { label: field.label })}
                  onClick={() => setFieldBeingChanged(field)}
                >
                  {t('fields.changeButton')}
                </Button>
                <Button
                  size="compact"
                  variant="destructive"
                  aria-label={formatMessage('fields.remove', { label: field.label })}
                  onClick={() => setFieldToRemove(field)}
                >
                  {t('fields.removeButton')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {isAdding ? (
        <FieldFormPanel
          isOpen
          object={object}
          onClose={() => setIsAdding(false)}
          onSaved={(label) => {
            setIsAdding(false);
            setNotice(formatMessage('fields.added', { label }));
            resource.reload();
          }}
        />
      ) : null}
      {fieldBeingChanged ? (
        <FieldFormPanel
          isOpen
          object={fieldBeingChanged.object}
          field={fieldBeingChanged}
          onClose={() => setFieldBeingChanged(null)}
          onSaved={(label) => {
            setFieldBeingChanged(null);
            setNotice(formatMessage('fields.changed', { label }));
            resource.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={fieldToRemove !== null}
        title={fieldToRemove ? formatMessage('fields.removeTitle', { label: fieldToRemove.label }) : ''}
        description={t('fields.removeDescription')}
        confirmLabel={t('fields.removeConfirm')}
        cancelLabel={t('fields.form.cancel')}
        closeLabel={t('fields.form.close')}
        tone="danger"
        isConfirming={isRemoving}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setFieldToRemove(null)}
      />
    </div>
  );
}
