import { useState } from 'react';
import type { UnansweredQuestion } from '@toobler-one/shared';
import { Alert, Badge, Button, Card, Checkbox, EmptyState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import { describeFaqProblem } from './problem-message';
import { describeAskedTimes, formatAskedDate, sortOpenQuestions } from './unanswered-state';

/**
 * The questions customers asked that the AI could not answer, most asked first. Anyone on the team can answer one (it becomes an FAQ) or ignore
 * it. A box shows the answered and ignored ones too. `onAnswer` opens the answer panel; ignoring is done here.
 */
export function UnansweredCard(props: {
  questions: readonly UnansweredQuestion[];
  showHistory: boolean;
  onShowHistoryChange: (showHistory: boolean) => void;
  timeZone: string;
  onAnswer: (question: UnansweredQuestion) => void;
  onChanged: () => void;
}) {
  const { questions, showHistory, onShowHistoryChange, timeZone, onAnswer, onChanged } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ordered = sortOpenQuestions(questions.filter((question) => question.status === 'open'));
  const history = questions.filter((question) => question.status !== 'open');

  const ignore = async (question: UnansweredQuestion) => {
    setBusyId(question.id);
    setProblem(null);
    try {
      await apiRequest('POST', `/knowledge/unanswered/${question.id}/dismiss`);
      onChanged();
    } catch (error) {
      setProblem(describeFaqProblem(error));
    } finally {
      setBusyId(null);
    }
  };

  const row = (question: UnansweredQuestion, isOpen: boolean) => {
    const asked = describeAskedTimes(question.count);
    return (
      <li key={question.id} className="flex flex-col gap-2 border-b border-border-default py-4 last:border-b-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-label-md text-text-primary">{question.question}</p>
          {isOpen ? null : <Badge tone={question.status === 'answered' ? 'success' : 'neutral'}>{t(`faqs.unanswered.status.${question.status}` as MessageKey)}</Badge>}
        </div>
        <p className="text-label-sm text-text-secondary">
          {formatMessage(asked.key, { count: asked.count })} · {formatMessage('faqs.unanswered.lastAsked', { date: formatAskedDate(question.lastAskedAt, timeZone) })}
        </p>
        {isOpen ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="compact" disabled={busyId === question.id} onClick={() => onAnswer(question)} aria-label={formatMessage('faqs.unanswered.answerLabel', { question: question.question })}>
              {t('faqs.unanswered.answer')}
            </Button>
            <Button variant="tertiary" size="compact" isLoading={busyId === question.id} onClick={() => ignore(question)} aria-label={formatMessage('faqs.unanswered.ignoreLabel', { question: question.question })}>
              {t('faqs.unanswered.ignore')}
            </Button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <Card>
      <h2 className="text-heading-sm text-text-primary">{t('faqs.unanswered.title')}</h2>
      <p className="text-body-md mb-3 text-text-secondary">{t('faqs.unanswered.description')}</p>
      {problem ? <Alert tone="error" className="mb-3">{problem}</Alert> : null}
      {ordered.length === 0 ? (
        <EmptyState icon={<span aria-hidden>✅</span>} title={t('faqs.unanswered.empty.title')} description={t('faqs.unanswered.empty.description')} />
      ) : (
        <ul>{ordered.map((question) => row(question, true))}</ul>
      )}
      <div className="mt-3">
        <Checkbox label={t('faqs.unanswered.showHistory')} checked={showHistory} onChange={(event) => onShowHistoryChange(event.target.checked)} />
      </div>
      {showHistory && history.length > 0 ? <ul className="mt-2">{history.map((question) => row(question, false))}</ul> : null}
    </Card>
  );
}
