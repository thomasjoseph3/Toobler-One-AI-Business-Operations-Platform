import { useState } from 'react';
import type { ProfileProgress } from '@toobler-one/shared';
import { Alert, Button, Card } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeSaveProblem } from './problem-message';

/** How complete the profile is, what is still needed to go live, and (for a manager) one button to say Yes to every answer waiting for a check. */
export function ProfileProgressCard(props: {
  progress: ProfileProgress;
  questionTexts: ReadonlyMap<string, string>;
  waitingKeys: readonly string[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { progress, questionTexts, waitingKeys, canEdit, onChanged } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const confirmAll = async () => {
    setIsConfirming(true);
    setProblem(null);
    try {
      await apiRequest('POST', '/knowledge/answers/confirm', { questionKeys: [...waitingKeys] });
      onChanged();
    } catch (error) {
      setProblem(describeSaveProblem(error));
    } finally {
      setIsConfirming(false);
    }
  };

  const stillNeeded = progress.neededToGoLiveStillMissing.map((key) => questionTexts.get(key) ?? key);
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-heading-sm text-text-primary">{t('knowledge.progress.title')}</h2>
        <p className="text-label-md text-text-secondary">
          {formatMessage('knowledge.progress.percent', { percent: progress.percentComplete })}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={t('knowledge.progress.bar')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percentComplete}
        className="my-3 h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
      >
        <div className="h-full rounded-full bg-action" style={{ width: `${progress.percentComplete}%` }} />
      </div>
      <p className="text-body-md text-text-secondary">
        {formatMessage('knowledge.progress.summary', {
          answered: progress.answeredQuestions,
          total: progress.totalQuestions,
        })}
      </p>
      {stillNeeded.length > 0 ? (
        <div className="mt-2">
          <p className="text-body-md text-text-primary">{t('knowledge.progress.needed')}</p>
          <ul className="text-body-md mt-1 list-disc pl-6 text-text-primary">
            {stillNeeded.map((questionText) => (
              <li key={questionText}>{questionText}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-body-md mt-2 text-success">{t('knowledge.progress.ready')}</p>
      )}
      {waitingKeys.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-md bg-warning-bg p-3">
          <p className="text-body-md text-text-primary">
            {waitingKeys.length === 1
              ? t('knowledge.progress.waitingOne')
              : formatMessage('knowledge.progress.waiting', { count: waitingKeys.length })}
          </p>
          {canEdit ? (
            <div>
              <Button variant="primary" size="compact" isLoading={isConfirming} onClick={confirmAll}>
                {t('knowledge.progress.confirmAll')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {problem ? (
        <Alert tone="error" className="mt-3">
          {problem}
        </Alert>
      ) : null}
    </Card>
  );
}
