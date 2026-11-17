import { useState } from 'react';
import type { SetupResponse } from '@toobler-one/shared';
import { Alert, Button, Card } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';
import { describeSaveProblem } from '../knowledge/problem-message';
import { describeBlocker, STEP_DESCRIPTIONS } from './setup-state';

/** The Go live card: what still stops the business going live (in plain words), or the Go live button when nothing does. */
export function GoLiveCard(props: {
  setup: SetupResponse;
  questionTexts: ReadonlyMap<string, string>;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { setup, questionTexts, canEdit, onChanged } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [justWentLive, setJustWentLive] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const goLive = async () => {
    setIsWorking(true);
    setProblem(null);
    try {
      await apiRequest('POST', '/setup/go-live');
      setJustWentLive(true);
      onChanged();
    } catch (error) {
      setProblem(
        error instanceof ApiRequestError && error.code === 'NOT_READY'
          ? t('setup.problem.notReady')
          : describeSaveProblem(error),
      );
      if (error instanceof ApiRequestError && error.code === 'NOT_READY') onChanged(); // the list may have changed: show what is left
    } finally {
      setIsWorking(false);
    }
  };

  const stepTitle = (step: string) =>
    t(STEP_DESCRIPTIONS[step as keyof typeof STEP_DESCRIPTIONS].titleKey as MessageKey);
  return (
    <Card>
      <h2 className="text-heading-sm text-text-primary">{t('setup.goLive.title')}</h2>
      <p className="text-body-md mb-3 text-text-secondary">{t('setup.goLive.description')}</p>
      {setup.isLive ? (
        <Alert tone="success">{justWentLive ? t('setup.goLive.success') : t('setup.goLive.alreadyLive')}</Alert>
      ) : setup.readyToGoLive ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-md text-success">{t('setup.goLive.ready')}</p>
          {canEdit ? (
            <div>
              <Button variant="primary" isLoading={isWorking} onClick={goLive}>
                {t('setup.goLive.button')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body-md text-text-primary">{t('setup.goLive.blockers')}</p>
          <ul className="text-body-md list-disc pl-6 text-text-primary">
            {setup.blockers.map((blocker) => (
              <li key={`${blocker.kind}-${blocker.key}`}>{describeBlocker(blocker, questionTexts, stepTitle)}</li>
            ))}
          </ul>
          {canEdit ? (
            <div>
              <Button variant="primary" disabled aria-disabled="true">
                {t('setup.goLive.button')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {problem ? (
        <Alert tone="error" className="mt-3">
          {problem}
        </Alert>
      ) : null}
    </Card>
  );
}
