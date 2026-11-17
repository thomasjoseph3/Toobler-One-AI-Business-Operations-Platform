import { useState } from 'react';
import { Link } from 'react-router';
import type { KnowledgeQuestion } from '@toobler-one/shared';
import { Alert, Badge, Button } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';
import { canBeAnsweredHere, formatAnswer } from './answer-draft';
import { AnswerEditor } from './AnswerEditor';
import { describeSaveProblem } from './problem-message';
import { describeQuestionState } from './profile-state';

const SOURCE_WORDS: Record<string, MessageKey> = {
  website: 'knowledge.question.fromWebsite',
  listing: 'knowledge.question.fromListing',
  document: 'knowledge.question.fromDocument',
};

/**
 * One business question with its answer. A manager can answer or change it (an editor opens in place), and say Yes to an answer the
 * system filled in from the website. Staff only read. An answer waiting for a check is marked "Please check" and says where it came from.
 */
export function QuestionRow(props: {
  question: KnowledgeQuestion;
  canEdit: boolean;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onChanged: () => void;
}) {
  const { question, canEdit, isEditing, onStartEditing, onStopEditing, onChanged } = props;
  const state = describeQuestionState(question);
  const [problem, setProblem] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const lines = question.answer ? formatAnswer(question, question.answer.value) : [];
  const sourceWords = question.answer ? SOURCE_WORDS[question.answer.source] : undefined;

  const sayYes = async () => {
    setIsConfirming(true);
    setProblem(null);
    try {
      await apiRequest('POST', '/knowledge/answers/confirm', { questionKeys: [question.key] });
      onChanged();
    } catch (error) {
      setProblem(describeSaveProblem(error instanceof ApiRequestError ? error : new Error('failed')));
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 border-b border-border-default py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-label-md max-w-prose text-text-primary">{question.text}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {question.neededToGoLive ? <Badge tone="info">{t('knowledge.question.needed')}</Badge> : null}
          {state === 'waiting' ? <Badge tone="warning">{t('knowledge.question.check')}</Badge> : null}
          {state === 'answered' ? <Badge tone="success">{t('knowledge.question.confirmed')}</Badge> : null}
        </div>
      </div>

      {isEditing ? (
        <AnswerEditor
          question={question}
          onCancel={onStopEditing}
          onSaved={() => {
            onStopEditing();
            onChanged();
          }}
        />
      ) : (
        <>
          {state === 'elsewhere_done' || state === 'elsewhere_open' ? (
            <p className="text-body-md text-text-secondary">
              {t(state === 'elsewhere_done' ? 'knowledge.question.elsewhereDone' : 'knowledge.question.elsewhereOpen')}{' '}
              <Link to="/knowledge/what-you-sell" className="text-link underline underline-offset-2 hover:text-link-hover">
                {t('knowledge.question.elsewhereLink')}
              </Link>
            </p>
          ) : lines.length > 0 ? (
            <div className="flex flex-col gap-1">
              {state === 'waiting' && sourceWords ? <p className="text-label-sm text-text-secondary">{t(sourceWords)}</p> : null}
              <ul className="text-body-md flex flex-col text-text-primary">
                {lines.map((line, position) => (
                  <li key={position} className="whitespace-pre-line">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-body-md text-text-secondary">{t('knowledge.question.noAnswer')}</p>
          )}
          {problem ? <Alert tone="error">{problem}</Alert> : null}
          {canEdit && canBeAnsweredHere(question) ? (
            <div className="flex flex-wrap gap-3">
              {state === 'waiting' ? (
                <>
                  <Button variant="primary" size="compact" isLoading={isConfirming} onClick={sayYes} aria-label={`${t('knowledge.question.yes')}: ${question.text}`}>
                    {t('knowledge.question.yes')}
                  </Button>
                  <Button variant="secondary" size="compact" onClick={onStartEditing} aria-label={`${t('knowledge.question.change')}: ${question.text}`}>
                    {t('knowledge.question.change')}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="compact" onClick={onStartEditing} aria-label={`${t(state === 'unanswered' ? 'knowledge.question.answer' : 'knowledge.question.change')}: ${question.text}`}>
                  {t(state === 'unanswered' ? 'knowledge.question.answer' : 'knowledge.question.change')}
                </Button>
              )}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}
