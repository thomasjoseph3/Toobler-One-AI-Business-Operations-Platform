import { useState } from 'react';
import type { FieldObject, FieldsListResponse } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ErrorState, LoadingState, SegmentedControl } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { SettingsTabs } from '../settings/SettingsTabs';
import { FieldFormPanel } from './FieldFormPanel';
import { describeFieldType, FIELD_OBJECT_CHOICES } from './fields-state';

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
  const [notice, setNotice] = useState<string | null>(null);

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
      <Card>
        {fieldsOfObject.length === 0 ? <p className="text-body-md text-text-secondary">{t('fields.empty')}</p> : null}
        <ul>
          {fieldsOfObject.map((field) => (
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
    </div>
  );
}
