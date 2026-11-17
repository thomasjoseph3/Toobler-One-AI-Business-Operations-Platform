import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  AGENT_TEST_MESSAGE_MAX,
  type AgentTestChatResponse,
  type AgentTestChatSummary,
} from '@toobler-one/shared';
import { Alert, Badge, Button, Card, Tag, TextAreaField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { KnowledgeTabs } from '../knowledge/KnowledgeTabs';
import {
  addLine,
  canSendMessage,
  describePromise,
  findToolWords,
  hasHeldBackAmounts,
  listDetails,
  takeBackLastLine,
  uniqueSources,
  type ChatLine,
} from './test-chat-state';

/** One plain sentence for a failed turn. The AI's own refusals (no key, over the limit) are written in plain words, so they are shown as they are. */
function describeTurnProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('testAgent.problem.network');
    if (error.status === 403) return t('testAgent.problem.forbidden');
    if (error.code.startsWith('AI_')) return error.message;
  }
  return t('testAgent.problem.generic');
}

/** What the agent did in its latest turn: where it answered from, what it learned, the promise, the steps, and any amount it held back. */
function Insights({ turn, timeZone }: { turn: AgentTestChatResponse | null; timeZone: string }) {
  if (turn === null) return <p className="text-body-md text-text-secondary">{t('testAgent.insights.none')}</p>;
  const sources = uniqueSources(turn.answeredFrom);
  const details = listDetails(turn.detailsSaved);
  const promise = turn.promise ? describePromise(turn.promise, timeZone) : null;
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="insight-sources">
        <h3 id="insight-sources" className="text-label-md mb-1 text-text-primary">{t('testAgent.insights.answeredFrom')}</h3>
        {sources.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {sources.map((source) => (
              <li key={`${source.kind}:${source.label}`}>
                <Tag tone="neutral">{`${t(`testAgent.source.${source.kind}` as MessageKey)}: ${source.label}`}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-md text-text-secondary">{t('testAgent.insights.noSource')}</p>
        )}
      </section>
      <section aria-labelledby="insight-learned">
        <h3 id="insight-learned" className="text-label-md mb-1 text-text-primary">{t('testAgent.insights.learned')}</h3>
        {details.length > 0 ? (
          <dl className="text-body-md grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {details.map((detail) => (
              <div key={detail.label} className="contents">
                <dt className="text-text-secondary">{detail.label}</dt>
                <dd className="text-text-primary">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-body-md text-text-secondary">{t('testAgent.insights.nothingLearned')}</p>
        )}
      </section>
      <section aria-labelledby="insight-promise">
        <h3 id="insight-promise" className="text-label-md mb-1 text-text-primary">{t('testAgent.insights.promise')}</h3>
        {promise ? (
          <div className="flex flex-col gap-1">
            <p className="text-body-md text-text-primary">“{promise.sentence}”</p>
            {promise.due ? <p className="text-label-sm text-text-secondary">{formatMessage('testAgent.insights.due', { time: promise.due })}</p> : null}
          </div>
        ) : (
          <p className="text-body-md text-text-secondary">{t('testAgent.insights.noPromise')}</p>
        )}
      </section>
      <section aria-labelledby="insight-situation">
        <h3 id="insight-situation" className="text-label-md mb-1 text-text-primary">{t('testAgent.insights.situation')}</h3>
        <p className="text-body-md text-text-primary">{t(`testAgent.situation.${turn.situation}` as MessageKey)}</p>
      </section>
      {turn.toolsCalled.length > 0 ? (
        <section aria-labelledby="insight-steps">
          <h3 id="insight-steps" className="text-label-md mb-1 text-text-primary">{t('testAgent.insights.steps')}</h3>
          <ul className="text-body-md flex flex-col gap-1 text-text-primary">
            {turn.toolsCalled.map((tool, position) => {
              const words = findToolWords(tool.name);
              return (
                <li key={position}>
                  {words ? t(words) : tool.name} {tool.ok ? '' : <span className="text-error">{t('testAgent.insights.stepFailed')}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {hasHeldBackAmounts(turn) ? (
        <Alert tone="error">{formatMessage('testAgent.insights.heldBack', { amounts: turn.heldBackAmounts.map((amount) => `₹${amount}`).join(', ') })}</Alert>
      ) : null}
    </div>
  );
}

/**
 * Knowledge base → Test the agent: the owner chats with their own AI agent as a customer would, and sees on the side what the agent did
 * (where it answered from, what it learned, the one promise, the steps it took). A test chat is saved but never becomes a lead or a ticket.
 * One test chat at a time; "Start a new test chat" begins again. Having had one answer here finishes the "Try the AI agent" setup step.
 */
export function TestAgentPage() {
  const { sessionState } = useSession();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [latestTurn, setLatestTurn] = useState<AgentTestChatResponse | null>(null);
  const [draftText, setDraftText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [summary, setSummary] = useState<AgentTestChatSummary | null>(null);
  const [isSummarising, setIsSummarising] = useState(false);
  const endOfChat = useRef<HTMLDivElement>(null);

  // Keep the newest line in view as the chat grows
  useEffect(() => {
    endOfChat.current?.scrollIntoView?.({ block: 'end' });
  }, [lines.length, isSending]);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const timeZone = sessionState.profile.business.timeZone;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (isSending || !canSendMessage(draftText, AGENT_TEST_MESSAGE_MAX)) return;
    const message = draftText.trim();
    setIsSending(true);
    setProblem(null);
    setSummary(null);
    setLines((earlier) => addLine(earlier, { sender: 'customer', body: message }));
    setDraftText('');
    try {
      const turn = await apiRequest<AgentTestChatResponse>('POST', '/agent/test-chat', {
        ...(conversationId ? { conversationId } : {}),
        message,
      });
      setConversationId(turn.conversationId);
      setLatestTurn(turn);
      setLines((earlier) => addLine(earlier, { sender: 'agent', body: turn.reply }));
    } catch (error) {
      // The message is put back in the box so nothing typed is lost
      setLines((earlier) => takeBackLastLine(earlier).lines);
      setDraftText(message);
      setProblem(describeTurnProblem(error));
    } finally {
      setIsSending(false);
    }
  };

  const startNewChat = () => {
    setLines([]);
    setConversationId(undefined);
    setLatestTurn(null);
    setSummary(null);
    setProblem(null);
    setDraftText('');
  };

  const showSummary = async () => {
    if (!conversationId) return;
    setIsSummarising(true);
    setProblem(null);
    try {
      setSummary(await apiRequest<AgentTestChatSummary>('POST', `/agent/test-chats/${conversationId}/summary`));
    } catch (error) {
      setProblem(describeTurnProblem(error));
    } finally {
      setIsSummarising(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <KnowledgeTabs />
      <div className="flex flex-col gap-1">
        <p className="text-body-md text-text-secondary">{t('testAgent.intro')}</p>
        <p className="text-body-md">
          <Link to="/knowledge" className="text-link underline underline-offset-2 hover:text-link-hover">
            {t('testAgent.back')}
          </Link>
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card aria-label={t('testAgent.chatLabel')}>
          <div className="flex flex-col gap-4">
            <div className="flex max-h-[28rem] min-h-48 flex-col gap-3 overflow-y-auto" role="log" aria-live="polite" aria-label={t('testAgent.chatLabel')}>
              {lines.length === 0 ? <p className="text-body-md text-text-secondary">{t('testAgent.empty')}</p> : null}
              {lines.map((line, position) => (
                <div key={position} className={line.sender === 'customer' ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
                  <span className="text-label-xs mb-0.5 text-text-secondary">{t(line.sender === 'customer' ? 'testAgent.you' : 'testAgent.agent')}</span>
                  <p
                    className={`text-body-md max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 ${
                      line.sender === 'customer' ? 'bg-action text-action-text' : 'bg-surface-subtle text-text-primary'
                    }`}
                  >
                    {line.body}
                  </p>
                </div>
              ))}
              {isSending ? <p className="text-body-md text-text-secondary">{t('testAgent.typing')}</p> : null}
              <div ref={endOfChat} />
            </div>
            {problem ? <Alert tone="error">{problem}</Alert> : null}
            <form onSubmit={send} className="flex flex-col gap-3">
              <TextAreaField
                label={t('testAgent.inputLabel')}
                placeholder={t('testAgent.inputPlaceholder')}
                rows={2}
                value={draftText}
                maxLength={AGENT_TEST_MESSAGE_MAX}
                onChange={(event) => setDraftText(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter makes a new line (the same as the website chat)
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant="primary" isLoading={isSending} disabled={!canSendMessage(draftText, AGENT_TEST_MESSAGE_MAX)}>
                  {t('testAgent.send')}
                </Button>
                <Button type="button" variant="secondary" onClick={startNewChat} disabled={isSending || lines.length === 0}>
                  {t('testAgent.newChat')}
                </Button>
              </div>
            </form>
          </div>
        </Card>
        <Card>
          <h2 className="text-heading-sm mb-3 text-text-primary">{t('testAgent.insights.title')}</h2>
          <Insights turn={latestTurn} timeZone={timeZone} />
          {conversationId ? (
            <div className="mt-5 flex flex-col gap-3 border-t border-border-default pt-4">
              <div>
                <Button variant="secondary" size="compact" isLoading={isSummarising} onClick={showSummary}>
                  {t('testAgent.summary.button')}
                </Button>
              </div>
              {summary ? (
                <div>
                  <h3 className="text-label-md mb-1 text-text-primary">{t('testAgent.summary.title')}</h3>
                  <p className="text-body-md text-text-primary">{summary.summary}</p>
                  {summary.writtenByAi ? null : <Badge tone="neutral" className="mt-2">{t('testAgent.summary.byCode')}</Badge>}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
