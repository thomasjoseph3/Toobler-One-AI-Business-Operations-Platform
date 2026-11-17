import { useState } from 'react';
import type { AiKey, AiKeyTestResult } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeKeyStatus, describeTestOutcome, groupKeysByProvider, PROVIDER_WORDS } from './ai-key-state';
import { AddKeyPanel } from './AddKeyPanel';
import { describeSettingsProblem } from './problem-message';

/** "17 Nov 2026" for a moment. */
const formatDay = (isoText: string): string => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(isoText));

/**
 * The business's own AI keys, by company: each shows its name, its last four characters, whether it works, and buttons to test it and delete it
 * (delete asks "Are you sure?" naming the key). A key is never shown in full. Adding one opens a panel.
 */
export function AiKeysCard({ keys, onChanged }: { keys: readonly AiKey[]; onChanged: () => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, AiKeyTestResult>>({});
  const [toDelete, setToDelete] = useState<AiKey | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const test = async (key: AiKey) => {
    setTestingId(key.id);
    setProblem(null);
    try {
      const result = await apiRequest<AiKeyTestResult>('POST', `/ai/keys/${key.id}/test`);
      setTestResults((earlier) => ({ ...earlier, [key.id]: result }));
      onChanged();
    } catch (error) {
      setProblem(describeSettingsProblem(error));
    } finally {
      setTestingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/ai/keys/${toDelete.id}`);
      onChanged();
    } catch (error) {
      setProblem(describeSettingsProblem(error));
    } finally {
      setToDelete(null);
      setIsDeleting(false);
    }
  };

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading-sm text-text-primary">{t('settings.ai.keys.title')}</h2>
        <Button variant="primary" size="compact" onClick={() => setIsAdding(true)}>
          {t('settings.ai.keys.add')}
        </Button>
      </div>
      <p className="text-label-sm mb-3 text-text-secondary">{t('settings.ai.keys.neverShown')}</p>
      {problem ? <Alert tone="error" className="mb-3">{problem}</Alert> : null}
      {keys.length === 0 ? (
        <EmptyState icon={<span aria-hidden>🔑</span>} title={t('settings.ai.keys.empty.title')} description={t('settings.ai.keys.empty.description')} />
      ) : (
        groupKeysByProvider(keys).map((group) => (
          <section key={group.provider} aria-label={t(PROVIDER_WORDS[group.provider])} className="mb-2">
            <h3 className="text-label-md mt-2 text-text-primary">{t(PROVIDER_WORDS[group.provider])}</h3>
            <ul>
              {group.keys.map((key) => {
                const status = describeKeyStatus(key.status);
                const result = testResults[key.id];
                const outcome = result ? describeTestOutcome(result.outcome) : null;
                return (
                  <li key={key.id} className="flex flex-col gap-2 border-b border-border-default py-3 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-label-md text-text-primary">
                        {key.label} <span className="text-body-md font-normal text-text-secondary">{key.keyPreview}</span>
                      </p>
                      <Badge tone={status.tone}>{t(status.words)}</Badge>
                    </div>
                    {key.statusNote ? <p className="text-label-sm text-text-secondary">{key.statusNote}</p> : null}
                    {key.statusCheckedAt ? <p className="text-label-sm text-text-secondary">{formatMessage('settings.ai.keys.checked', { date: formatDay(key.statusCheckedAt) })}</p> : null}
                    <div aria-live="polite">
                      {outcome && result ? (
                        <Alert tone={outcome.isGood ? 'success' : 'error'}>
                          {outcome.isGood && result.modelName !== null && result.latencyMs !== null
                            ? formatMessage('settings.ai.test.worksWith', { model: result.modelName, latency: Math.round(result.latencyMs) })
                            : t(outcome.words)}
                        </Alert>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="compact" isLoading={testingId === key.id} onClick={() => test(key)} aria-label={formatMessage('settings.ai.keys.testLabel', { label: key.label })}>
                        {t('settings.ai.keys.test')}
                      </Button>
                      <Button variant="destructive" size="compact" disabled={testingId === key.id} onClick={() => setToDelete(key)} aria-label={formatMessage('settings.ai.keys.deleteLabel', { label: key.label })}>
                        {t('settings.ai.keys.delete')}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {isAdding ? (
        <AddKeyPanel
          onClose={() => setIsAdding(false)}
          onSaved={() => {
            setIsAdding(false);
            onChanged();
          }}
        />
      ) : null}
      <ConfirmDialog
        isOpen={toDelete !== null}
        title={toDelete ? formatMessage('settings.ai.keys.deleteTitle', { label: toDelete.label }) : ''}
        description={t('settings.ai.keys.deleteDescription')}
        confirmLabel={t('settings.ai.keys.deleteConfirm')}
        cancelLabel={t('settings.ai.form.cancel')}
        closeLabel={t('settings.ai.form.close')}
        tone="danger"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
