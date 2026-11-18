import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { ConversationDetail, ConversationTypesListResponse } from '@toobler-one/shared';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  SelectField,
  Tag,
  TextAreaField,
} from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { formatMoment } from '../leads/lead-display';
import { useKeptData } from '../knowledge/use-kept-resource';
import { CHANNEL_MESSAGE_KEYS, describeInboxProblem } from './inbox-state';
import { useLiveUpdates } from './use-live-updates';

/** The most characters a reply can have (the same number as the API's limit). */
const MOST_CHARACTERS_IN_A_REPLY = 2000;

/** Who said a message, in words. */
function describeSpeaker(message: ConversationDetail['messages'][number], customerName: string): string {
  if (message.sender === 'customer') return customerName;
  if (message.sender === 'agent') return t('inbox.speaker.ai');
  if (message.sender === 'staff') return message.byUser?.name ?? t('inbox.speaker.team');
  return t('inbox.speaker.system');
}

/**
 * One conversation (`/inbox/:conversationId`): the messages, who has it, and the buttons that matter: "I'll handle this" (the AI stops), a reply box for the
 * person who holds it, "Hand back to AI", "Done" and "Change type". It refreshes by itself when something happens in this business (live updates).
 */
export function ConversationPage() {
  const { conversationId = '' } = useParams();
  const { sessionState } = useSession();
  const resource = useApiResource<ConversationDetail>(`/conversations/${conversationId}`);
  const typesResource = useApiResource<ConversationTypesListResponse>('/conversation-types');
  const kept = useKeptData(resource.state);
  useLiveUpdates(resource.reload);
  const [draft, setDraft] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [isAskingToHandBack, setIsAskingToHandBack] = useState(false);
  const [isAskingToFinish, setIsAskingToFinish] = useState(false);
  const timeZone = sessionState.status === 'signedIn' ? sessionState.profile.business.timeZone : 'UTC';
  const myUserId = sessionState.status === 'signedIn' ? sessionState.profile.user.id : '';

  const backLink = (
    <Link
      to="/inbox"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('inbox.back')}
    </Link>
  );
  const conversation = kept.data;
  if (kept.isFirstLoad) {
    return (
      <>
        {backLink}
        <LoadingState label={t('inbox.loading')} rows={4} />
      </>
    );
  }
  if (kept.hasFailed || conversation === null) {
    return (
      <>
        {backLink}
        <ErrorState
          title={t('inbox.conversationError.title')}
          description={t('inbox.conversationError.description')}
          action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
        />
      </>
    );
  }

  const iHoldIt = conversation.heldBy?.userId === myUserId;
  const someoneElseHoldsIt = conversation.heldBy !== null && !iHoldIt;
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  const customerName =
    conversation.contact?.name ?? conversation.fromPhone ?? conversation.fromEmail ?? t('inbox.unknownVisitor');
  const types =
    typesResource.state.status === 'ready' ? typesResource.state.data.items.filter((type) => type.isActive) : [];

  /** Runs one action, shows what went wrong in words, and loads the conversation again. */
  async function run(action: () => Promise<unknown>) {
    setProblem(null);
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setProblem(describeInboxProblem(error));
    } finally {
      setIsBusy(false);
      resource.reload();
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (body === '') return;
    await run(async () => {
      await apiRequest('POST', `/conversations/${conversationId}/reply`, { body });
      setDraft('');
    });
  }

  return (
    <>
      {backLink}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-heading-lg text-text-primary [overflow-wrap:anywhere]">{customerName}</h2>
        <Tag tone="neutral">{t(CHANNEL_MESSAGE_KEYS[conversation.channel])}</Tag>
        {conversation.needsPerson ? <Tag tone="lost">{t('inbox.needsPerson')}</Tag> : null}
        {conversation.type?.aiUnsure ? <Tag tone="rate-sent">{t('inbox.aiUnsure')}</Tag> : null}
        {conversation.type ? <Tag tone="neutral">{conversation.type.label}</Tag> : null}
        {conversation.doneAt ? <Tag tone="won">{t('inbox.done')}</Tag> : null}
        {conversation.endedAt ? <Tag tone="neutral">{t('inbox.ended')}</Tag> : null}
      </div>
      <p className="text-body-md mb-3 text-text-secondary">
        {conversation.heldBy
          ? iHoldIt
            ? t('inbox.youHoldIt')
            : formatMessage('inbox.heldByLong', { name: conversation.heldBy.name ?? t('inbox.someone') })
          : t('inbox.aiIsAnswering')}
      </p>
      {conversation.contact ? (
        <p className="text-body-md mb-3">
          <Link to={`/contacts/${conversation.contact.id}`} className="text-link hover:text-link-hover hover:underline">
            {t('inbox.openContact')}
          </Link>
        </p>
      ) : null}
      {problem ? (
        <Alert tone="error" className="mb-3">
          {problem}
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {!conversation.endedAt && !conversation.heldBy ? (
          <Button
            variant="primary"
            disabled={isBusy}
            onClick={() => void run(() => apiRequest('POST', `/conversations/${conversationId}/takeover`))}
          >
            {t('inbox.takeOver')}
          </Button>
        ) : null}
        {conversation.heldBy && (iHoldIt || isManager) ? (
          <Button variant="secondary" disabled={isBusy} onClick={() => setIsAskingToHandBack(true)}>
            {t('inbox.handBack')}
          </Button>
        ) : null}
        {!conversation.doneAt ? (
          <Button variant="secondary" disabled={isBusy} onClick={() => setIsAskingToFinish(true)}>
            {t('inbox.markDone')}
          </Button>
        ) : null}
        {types.length > 0 && conversation.status === 'sorted' ? (
          <SelectField
            label={t('inbox.changeType')}
            value={conversation.type?.key ?? ''}
            options={types.map((type) => ({ value: type.key, label: type.label }))}
            disabled={isBusy}
            onChange={(event) =>
              void run(() =>
                apiRequest('POST', `/conversations/${conversationId}/type`, { typeKey: event.target.value }),
              )
            }
          />
        ) : null}
      </div>

      <Card className="mb-4">
        <ol aria-label={t('inbox.messages')} className="flex flex-col gap-3">
          {conversation.messages.length === 0 ? (
            <li className="text-body-md text-text-secondary">{t('inbox.noWordsYet')}</li>
          ) : null}
          {conversation.messages.map((message) => (
            <li
              key={message.id}
              className={`flex flex-col ${message.sender === 'customer' ? 'items-start' : 'items-end'}`}
            >
              <span className="text-body-sm text-text-secondary">
                {describeSpeaker(message, customerName)} · {formatMoment(message.createdAt, timeZone)}
              </span>
              <p className="text-body-md max-w-[85%] rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-text-primary [overflow-wrap:anywhere]">
                {message.body}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      {iHoldIt && !conversation.endedAt ? (
        <form onSubmit={(event) => void sendReply(event)} className="flex flex-col gap-2">
          <TextAreaField
            label={t('inbox.replyLabel')}
            value={draft}
            maxLength={MOST_CHARACTERS_IN_A_REPLY}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div>
            <Button type="submit" variant="primary" disabled={isBusy || draft.trim() === ''}>
              {t('inbox.send')}
            </Button>
          </div>
        </form>
      ) : null}
      {someoneElseHoldsIt && !isManager ? (
        <p className="text-body-md text-text-secondary">{t('inbox.cannotReply')}</p>
      ) : null}

      <ConfirmDialog
        isOpen={isAskingToHandBack}
        title={formatMessage('inbox.handBack.title', { name: customerName })}
        description={t('inbox.handBack.description')}
        confirmLabel={t('inbox.handBack')}
        cancelLabel={t('inbox.keepIt')}
        closeLabel={t('inbox.closeQuestion')}
        isConfirming={isBusy}
        onConfirm={() => {
          setIsAskingToHandBack(false);
          void run(() => apiRequest('POST', `/conversations/${conversationId}/handback`));
        }}
        onCancel={() => setIsAskingToHandBack(false)}
      />
      <ConfirmDialog
        isOpen={isAskingToFinish}
        title={formatMessage('inbox.markDone.title', { name: customerName })}
        description={t('inbox.markDone.description')}
        confirmLabel={t('inbox.markDone')}
        cancelLabel={t('inbox.keepOpen')}
        closeLabel={t('inbox.closeQuestion')}
        isConfirming={isBusy}
        onConfirm={() => {
          setIsAskingToFinish(false);
          void run(() => apiRequest('POST', `/conversations/${conversationId}/done`));
        }}
        onCancel={() => setIsAskingToFinish(false)}
      />
    </>
  );
}
