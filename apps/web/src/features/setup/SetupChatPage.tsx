import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import type { ProfileProgress, SetupChatQuestion, SetupChatResponse } from '@toobler-one/shared';
import { Alert, Button, Card, TextAreaField, TextField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { addQuestionLine, buildReplyText, canSendReply, isPickQuestion, toggleOption, type SetupChatLine } from './setup-chat-state';

/** One plain sentence for a failed message. Never a code or a status number. */
function describeChatProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('setupChat.problem.network');
    if (error.status === 403) return t('setupChat.problem.forbidden');
    if (error.status === 429) return t('setupChat.problem.tooMany');
  }
  return t('setupChat.problem.generic');
}

/**
 * The setup chat: the business questions one at a time, in a conversation (phone first). The chat picks every question and the
 * answers go through the same checks as the form. Pick questions are buttons, Yes and No are buttons, everything else is typed;
 * any question can be skipped. It remembers what was skipped for this visit, and "Switch to the form" is always there. Managers only.
 */
export function SetupChatPage() {
  const { sessionState } = useSession();
  const [lines, setLines] = useState<SetupChatLine[]>([]);
  const [question, setQuestion] = useState<SetupChatQuestion | null>(null);
  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [formOnlyRemaining, setFormOnlyRemaining] = useState(0);
  const [skippedQuestionKeys, setSkippedQuestionKeys] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [typedText, setTypedText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';

  // Shows what the chat answered: the reply line, the problem in words, the next question, the progress. Uses only setters, so it never changes.
  const applyResponse = useCallback((response: SetupChatResponse, replyLineText: string | null) => {
    setLines((current) => {
      let nextLines = replyLineText === null ? [...current] : [...current, { kind: 'reply', text: replyLineText } as SetupChatLine];
      if (response.problem !== null) nextLines = [...nextLines, { kind: 'problem', text: response.problem }];
      return response.next === null ? nextLines : addQuestionLine(nextLines, response.next);
    });
    setQuestion(response.next);
    setProgress(response.progress);
    setFormOnlyRemaining(response.formOnlyRemaining);
    // A reply that was used clears the boxes; one that was not keeps what was typed so it can be changed
    if (response.problem === null) {
      setSelectedOptions([]);
      setTypedText('');
    }
  }, []);

  // Sends one message to the chat and shows what came back.
  async function sendToChat(body: Record<string, unknown>, replyLineText: string | null) {
    setIsSending(true);
    setProblem(null);
    try {
      applyResponse(await apiRequest<SetupChatResponse>('POST', '/setup/chat', body), replyLineText);
    } catch (error) {
      setProblem(describeChatProblem(error));
    } finally {
      setIsSending(false);
    }
  }

  // The first question, when the page opens. Nothing is set until the answer arrives; an answer for a page that was left is dropped.
  useEffect(() => {
    if (!isManager) return;
    let isCancelled = false;
    apiRequest<SetupChatResponse>('POST', '/setup/chat', {})
      .then((response) => {
        if (!isCancelled) applyResponse(response, null);
      })
      .catch((error: unknown) => {
        if (!isCancelled) setProblem(describeChatProblem(error));
      })
      .finally(() => {
        if (!isCancelled) setIsStarting(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [isManager, applyResponse]);

  // Keeps the newest line in view
  useEffect(() => {
    logEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lines]);

  if (sessionState.status !== 'signedIn') return null;
  if (!isManager) {
    return (
      <Card>
        <p className="text-body-md text-text-secondary">{t('setup.managersOnly')}</p>
      </Card>
    );
  }

  const sendReply = (replyText: string) => {
    if (question === null || replyText.trim() === '') return;
    void sendToChat({ questionKey: question.key, reply: replyText, skippedQuestionKeys }, replyText);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (question === null || !canSendReply(typedText, selectedOptions)) return;
    sendReply(buildReplyText(question, selectedOptions, typedText));
  };
  const skipQuestion = () => {
    if (question === null) return;
    const newSkipped = [...skippedQuestionKeys, question.key];
    setSkippedQuestionKeys(newSkipped);
    void sendToChat({ questionKey: question.key, skip: true, skippedQuestionKeys: newSkipped }, t('setupChat.skipped'));
  };

  const percentComplete = progress?.percentComplete ?? 0;
  const isYesNo = question?.type === 'yes_no';
  const isPick = question !== null && isPickQuestion(question);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link to="/setup" className="text-body-md-semibold inline-flex items-center gap-1 text-link hover:text-link-hover">
        <ArrowLeft aria-hidden className="size-4" />
        {t('setupChat.back')}
      </Link>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-heading-sm text-text-primary">{t('setupChat.title')}</h2>
          <Link to="/knowledge" className="text-label-md text-link underline underline-offset-2 hover:text-link-hover">
            {t('setupChat.switchToForm')}
          </Link>
        </div>
        <div role="progressbar" aria-label={t('setup.progress.bar')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentComplete} className="my-3 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div className="h-full rounded-full bg-action" style={{ width: `${percentComplete}%` }} />
        </div>
        {progress ? <p className="text-label-sm text-text-secondary">{formatMessage('setupChat.progress', { answered: progress.answeredQuestions, total: progress.totalQuestions })}</p> : null}
      </Card>
      <Card>
        <div role="log" aria-live="polite" aria-label={t('setupChat.logLabel')} className="mb-4 flex max-h-[50vh] min-h-[120px] flex-col gap-3 overflow-y-auto">
          {isStarting ? <p className="text-body-md text-text-secondary">{t('setupChat.loading')}</p> : null}
          {lines.map((line, index) => (
            <div
              key={index}
              className={
                line.kind === 'reply'
                  ? 'text-body-md ml-auto max-w-[85%] rounded-lg bg-action px-3 py-2 text-action-text'
                  : line.kind === 'problem'
                    ? 'text-body-md max-w-[85%] rounded-lg border border-error bg-error-bg px-3 py-2 text-error'
                    : 'text-body-md max-w-[85%] rounded-lg bg-surface-subtle px-3 py-2 text-text-primary'
              }
            >
              {line.text}
            </div>
          ))}
          {question === null && !isStarting && progress !== null ? (
            <div className="text-body-md max-w-[85%] rounded-lg bg-surface-subtle px-3 py-2 text-text-primary">
              {formOnlyRemaining > 0 ? formatMessage('setupChat.done.formLeft', { count: formOnlyRemaining }) : t('setupChat.done.allAsked')}
            </div>
          ) : null}
          <div ref={logEndRef} />
        </div>

        {problem ? <Alert tone="error" className="mb-3">{problem}</Alert> : null}

        {question !== null ? (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            {question.neededToGoLive ? <p className="text-label-sm text-text-secondary">{t('setupChat.needed')}</p> : null}
            {isYesNo ? (
              <div className="flex gap-2">
                <Button variant="primary" disabled={isSending} onClick={() => sendReply(typedText.trim() !== '' ? `Yes, ${typedText.trim()}` : 'Yes')}>
                  {t('setupChat.yes')}
                </Button>
                <Button disabled={isSending} onClick={() => sendReply('No')}>
                  {t('setupChat.no')}
                </Button>
              </div>
            ) : null}
            {isPick ? (
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">{question.text}</legend>
                {question.options.map((option) => {
                  const isChosen = selectedOptions.includes(option);
                  return (
                    <Button
                      key={option}
                      variant={isChosen ? 'primary' : 'secondary'}
                      aria-pressed={isChosen}
                      disabled={isSending}
                      onClick={() => setSelectedOptions((current) => toggleOption(question, current, option))}
                    >
                      {isChosen ? `✓ ${option}` : option}
                    </Button>
                  );
                })}
              </fieldset>
            ) : null}
            {question.type === 'long_text' ? (
              <TextAreaField label={t('setupChat.yourAnswer')} value={typedText} onChange={(event) => setTypedText(event.target.value)} />
            ) : (
              <TextField
                label={isPick ? t('setupChat.orOwnWords') : isYesNo ? (question.yesDetailLabel ?? t('setupChat.yesDetail')) : t('setupChat.yourAnswer')}
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
                autoComplete="off"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {isYesNo ? null : (
                <Button type="submit" variant="primary" isLoading={isSending} disabled={!canSendReply(typedText, selectedOptions)}>
                  {t('setupChat.send')}
                </Button>
              )}
              <Button disabled={isSending} onClick={skipQuestion}>
                {t('setupChat.skip')}
              </Button>
            </div>
          </form>
        ) : null}

        {question === null && !isStarting ? (
          <div className="flex flex-wrap gap-2">
            <Link to="/knowledge" className="text-body-md-semibold inline-flex h-10 items-center rounded-md bg-action px-4 text-action-text hover:bg-action-hover">
              {t('setupChat.openForm')}
            </Link>
            <Link to="/setup" className="text-body-md-semibold inline-flex h-10 items-center rounded-md border border-border-default px-4 text-text-primary hover:bg-hover">
              {t('setupChat.backToSetup')}
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
