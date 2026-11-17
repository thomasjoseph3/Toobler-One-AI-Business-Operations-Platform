import { Link } from 'react-router';
import type { KnowledgeQuestionsResponse, SetupResponse } from '@toobler-one/shared';
import { Badge, Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { GoLiveCard } from './GoLiveCard';
import { SetupStepRow } from './SetupStepRow';
import { countFinishedSteps, findNextStep, STEP_DESCRIPTIONS, stepsOfPart } from './setup-state';

/** "17 Nov 2026", the design system's unambiguous date style. */
const formatDate = (isoText: string): string =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(isoText));

/**
 * The Setup guide: how far the business is from being ready, the steps in two parts, and the Go live card. A manager marks steps and goes live;
 * staff are told it is for managers. It has loading and error states, and keeps what is on screen while a change reloads.
 */
export function SetupPage() {
  const { sessionState } = useSession();
  const setupResource = useApiResource<SetupResponse>('/setup');
  const questionsResource = useApiResource<KnowledgeQuestionsResponse>('/knowledge/questions');
  const setupData = useKeptData(setupResource.state);
  const questionsData = useKeptData(questionsResource.state);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const canEdit = sessionState.profile.user.role === 'manager';
  if (!canEdit) {
    return (
      <Card>
        <p className="text-body-md text-text-secondary">{t('setup.managersOnly')}</p>
      </Card>
    );
  }
  if (setupData.isFirstLoad) return <LoadingState label={t('setup.loading')} />;
  if (setupData.hasFailed || setupData.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('setup.error.title')}
          description={t('setup.error.description')}
          action={<Button variant="secondary" onClick={setupResource.reload}>{t('knowledge.retry')}</Button>}
        />
      </Card>
    );
  }

  const setup = setupData.data;
  const questionTexts = new Map((questionsData.data?.questions ?? []).map((question) => [question.key, question.text]));
  const nextStep = findNextStep(setup.steps);
  const reloadAll = () => {
    setupResource.reload();
    questionsResource.reload();
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-heading-sm text-text-primary">{t('setup.progress.title')}</h2>
          <div className="flex items-center gap-3">
            <Badge tone={setup.isLive ? 'success' : 'neutral'}>{setup.isLive ? t('setup.live.badge') : t('setup.live.notYet')}</Badge>
            <p className="text-label-md text-text-secondary">{formatMessage('setup.progress.percent', { percent: setup.percentDone })}</p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={t('setup.progress.bar')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={setup.percentDone}
          className="my-3 h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
        >
          <div className="h-full rounded-full bg-action" style={{ width: `${setup.percentDone}%` }} />
        </div>
        {setup.isLive && setup.liveAt ? (
          <p className="text-body-md text-text-secondary">{formatMessage('setup.live.since', { date: formatDate(setup.liveAt) })}</p>
        ) : null}
        <p className="text-body-md text-text-primary">
          {nextStep
            ? formatMessage('setup.progress.next', { step: t(STEP_DESCRIPTIONS[nextStep.key].titleKey as MessageKey) })
            : t('setup.progress.allDone')}
        </p>
        <div className="mt-3">
          <Link to="/setup/chat" className="text-body-md-semibold inline-flex h-10 items-center rounded-md bg-action px-4 text-action-text hover:bg-action-hover">
            {t('setup.chat.open')}
          </Link>
        </div>
        <p className="text-body-md mt-2 text-text-secondary">
          <Link to="/knowledge" className="text-link underline underline-offset-2 hover:text-link-hover">
            {t('nav.knowledge')}
          </Link>
        </p>
      </Card>

      {([1, 2] as const).map((part) => {
        const steps = stepsOfPart(setup.steps, part);
        const { finished, total } = countFinishedSteps(steps);
        return (
          <Card key={part} aria-labelledby={`setup-part-${part}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`setup-part-${part}`} className="text-heading-sm text-text-primary">
                {t(`setup.part.${part}` as MessageKey)}
              </h2>
              <p className="text-label-sm text-text-secondary">{formatMessage('setup.part.count', { finished, total })}</p>
            </div>
            <ul>
              {steps.map((step) => (
                <SetupStepRow key={step.key} step={step} canEdit={canEdit} onChanged={reloadAll} />
              ))}
            </ul>
          </Card>
        );
      })}

      <GoLiveCard setup={setup} questionTexts={questionTexts} canEdit={canEdit} onChanged={reloadAll} />
    </div>
  );
}
