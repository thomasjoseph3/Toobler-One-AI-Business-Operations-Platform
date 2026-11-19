import { useState, type FormEvent } from 'react';
import type {
  EmailCheckResult,
  EmailDraft,
  EmailDraftsResponse,
  EmailReplyMode,
  EmailSettings,
} from '@toobler-one/shared';
import { Alert, Button, Card, ConfirmDialog, ErrorState, LoadingState, TextField } from '@toobler-one/ui';
import { apiRequest, ApiRequestError } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { describeChannelProblem } from './problem-message';
import { formatSeenAt } from './webchat-form';

/** One plain sentence for a failed email change: the API's own words for a refusal it explained, else a general one. */
function describeEmailProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 500) return t('channels.email.problem.sendFailed');
    if ((error.status === 400 || error.status === 409) && error.message) return error.message;
  }
  return describeChannelProblem(error);
}

/**
 * Channels → Email (managers only: it holds the mailbox login and the customers' emails). Connect the mailbox the AI reads, choose whether the AI
 * sends its replies or writes drafts for a team member to approve, check the connection, and approve or discard the waiting drafts. The password
 * is never shown again after saving, only its last four characters.
 */
export function EmailCard(props: { timeZone: string }) {
  const settingsResource = useApiResource<EmailSettings>('/channels/email');
  const draftsResource = useApiResource<EmailDraftsResponse>('/channels/email/drafts');
  const settingsKept = useKeptData(settingsResource.state);
  const draftsKept = useKeptData(draftsResource.state);
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<EmailCheckResult | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [toDiscard, setToDiscard] = useState<EmailDraft | null>(null);

  const isOff = settingsResource.state.status === 'error' && settingsResource.state.httpStatus === 404;
  if (settingsKept.isFirstLoad) return <LoadingState label={t('channels.loading')} />;
  if (isOff) {
    return (
      <Card>
        <h2 className="text-heading-sm text-text-primary">{t('channels.email.off.title')}</h2>
        <p className="text-body-md text-text-secondary">{t('channels.email.off.description')}</p>
      </Card>
    );
  }
  if (settingsKept.hasFailed || settingsKept.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('channels.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={settingsResource.reload}>
              {t('knowledge.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  const connection = settingsKept.data.connection;
  const drafts = draftsKept.data?.items ?? [];
  const showForm = connection === null || isEditing;

  /** Runs one change with the busy state and the problem line handled in one place. */
  const run = async (work: () => Promise<void>) => {
    setIsWorking(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(describeEmailProblem(error));
    } finally {
      setIsWorking(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      await apiRequest('PUT', '/channels/email', {
        address: address.trim() === '' ? (connection?.address ?? '') : address.trim(),
        ...(password === '' ? {} : { password }),
        ...(imapHost.trim() === '' ? {} : { imapHost: imapHost.trim() }),
        ...(smtpHost.trim() === '' ? {} : { smtpHost: smtpHost.trim() }),
      });
      setPassword('');
      setAddress('');
      setImapHost('');
      setSmtpHost('');
      setIsEditing(false);
      setCheckResult(null);
      settingsResource.reload();
    });
  };

  const check = () =>
    run(async () => {
      setCheckResult(await apiRequest<EmailCheckResult>('POST', '/channels/email/check'));
      settingsResource.reload();
    });

  const change = (changes: { replyMode?: EmailReplyMode; readEmails?: boolean }) =>
    run(async () => {
      if (connection === null) return;
      await apiRequest('PUT', '/channels/email', { address: connection.address, ...changes });
      settingsResource.reload();
    });

  const disconnect = () =>
    run(async () => {
      await apiRequest('DELETE', '/channels/email');
      setIsDisconnecting(false);
      setCheckResult(null);
      settingsResource.reload();
      draftsResource.reload();
    });

  const sendDraft = (draft: EmailDraft) =>
    run(async () => {
      const edited = editedBodies[draft.id];
      await apiRequest(
        'POST',
        `/channels/email/drafts/${draft.id}/send`,
        edited !== undefined && edited !== draft.body ? { body: edited } : {},
      );
      draftsResource.reload();
      settingsResource.reload();
    });

  const discardDraft = () =>
    run(async () => {
      if (toDiscard === null) return;
      await apiRequest('DELETE', `/channels/email/drafts/${toDiscard.id}`);
      setToDiscard(null);
      draftsResource.reload();
    });

  return (
    <Card>
      <h2 className="text-heading-sm mb-1 text-text-primary">{t('channels.email.title')}</h2>
      <p className="text-body-md mb-3 text-text-secondary">{t('channels.email.intro')}</p>

      {connection !== null ? (
        <div className="mb-4 flex flex-col gap-2 rounded-md bg-surface-subtle p-3" aria-live="polite">
          <p className="text-body-md text-text-primary">
            <span className="text-label-md">{t('channels.email.mailbox')}: </span>
            {connection.address}
            <span className="text-label-sm text-text-secondary"> ({connection.imapHost})</span>
          </p>
          <p className="text-body-md text-text-primary">
            <span className="text-label-md">{t('channels.email.status')}: </span>
            {t(`channels.email.status.${connection.status}`)}
            {connection.statusNote ? <span className="text-text-secondary"> — {connection.statusNote}</span> : null}
          </p>
          <p className="text-body-md text-text-secondary">
            {connection.lastEmailAt
              ? formatMessage('channels.email.lastEmail', {
                  when: formatSeenAt(connection.lastEmailAt, props.timeZone),
                })
              : t('channels.email.noEmailsYet')}
          </p>
          <p className="text-body-md text-text-secondary">
            {connection.readEmails ? t('channels.email.reading.on') : t('channels.email.reading.off')}{' '}
            {connection.replyMode === 'send' ? t('channels.email.mode.send') : t('channels.email.mode.draft')}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="compact" onClick={check} isLoading={isWorking}>
              {t('channels.email.check')}
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={isWorking}
              onClick={() => change({ replyMode: connection.replyMode === 'send' ? 'draft' : 'send' })}
            >
              {connection.replyMode === 'send' ? t('channels.email.switchToDraft') : t('channels.email.switchToSend')}
            </Button>
            <Button
              variant="secondary"
              size="compact"
              disabled={isWorking}
              onClick={() => change({ readEmails: !connection.readEmails })}
            >
              {connection.readEmails ? t('channels.email.pause') : t('channels.email.resume')}
            </Button>
            <Button variant="tertiary" size="compact" onClick={() => setIsEditing(!isEditing)}>
              {t('channels.email.change')}
            </Button>
            <Button variant="tertiary" size="compact" onClick={() => setIsDisconnecting(true)}>
              {t('channels.email.disconnect')}
            </Button>
          </div>
          {checkResult ? <Alert tone={checkResult.ok ? 'success' : 'error'}>{checkResult.note}</Alert> : null}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <TextField
            label={t('channels.email.form.address')}
            helperText={connection ? connection.address : t('channels.email.form.addressHelper')}
            type="email"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <TextField
            label={t('channels.email.form.password')}
            helperText={
              connection
                ? formatMessage('channels.email.form.passwordKept', { preview: connection.passwordPreview })
                : t('channels.email.form.passwordHelper')
            }
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label={t('channels.email.form.imapHost')}
            requirementLabel={t('channels.email.form.optional')}
            helperText={t('channels.email.form.hostHelper')}
            value={imapHost}
            onChange={(event) => setImapHost(event.target.value)}
          />
          <TextField
            label={t('channels.email.form.smtpHost')}
            requirementLabel={t('channels.email.form.optional')}
            value={smtpHost}
            onChange={(event) => setSmtpHost(event.target.value)}
          />
          <div>
            <Button type="submit" variant="primary" isLoading={isWorking}>
              {connection ? t('channels.email.form.save') : t('channels.email.form.connect')}
            </Button>
          </div>
        </form>
      ) : null}
      {problem ? (
        <Alert tone="error" className="mt-3">
          {problem}
        </Alert>
      ) : null}

      <h3 className="text-label-md mb-2 mt-6 text-text-primary">{t('channels.email.drafts.title')}</h3>
      {draftsKept.isFirstLoad ? (
        <LoadingState label={t('channels.email.drafts.loading')} />
      ) : draftsKept.hasFailed ? (
        <ErrorState
          title={t('channels.email.drafts.error')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={draftsResource.reload}>
              {t('knowledge.retry')}
            </Button>
          }
        />
      ) : drafts.length === 0 ? (
        <p className="text-body-md text-text-secondary">{t('channels.email.drafts.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex flex-col gap-2 rounded-md border border-border-default p-3">
              <p className="text-body-md text-text-primary">
                <span className="text-label-md">{t('channels.email.drafts.to')}: </span>
                {draft.toEmail}
              </p>
              <p className="text-body-md text-text-primary">
                <span className="text-label-md">{t('channels.email.drafts.subject')}: </span>
                {draft.subject}
              </p>
              <label htmlFor={`draft-${draft.id}`} className="text-label-sm text-text-primary">
                {t('channels.email.drafts.reply')}
              </label>
              <textarea
                id={`draft-${draft.id}`}
                rows={6}
                value={editedBodies[draft.id] ?? draft.body}
                onChange={(event) => setEditedBodies({ ...editedBodies, [draft.id]: event.target.value })}
                className="text-body-md w-full rounded-md border border-border-default bg-surface-default p-3 text-text-primary"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="compact" disabled={isWorking} onClick={() => sendDraft(draft)}>
                  {t('channels.email.drafts.send')}
                </Button>
                <Button variant="tertiary" size="compact" disabled={isWorking} onClick={() => setToDiscard(draft)}>
                  {t('channels.email.drafts.discard')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={isDisconnecting}
        title={t('channels.email.disconnectTitle')}
        description={t('channels.email.disconnectDescription')}
        confirmLabel={t('channels.email.disconnect')}
        cancelLabel={t('whatYouSell.form.cancel')}
        closeLabel={t('whatYouSell.form.close')}
        tone="danger"
        isConfirming={isWorking}
        onConfirm={disconnect}
        onCancel={() => setIsDisconnecting(false)}
      />
      <ConfirmDialog
        isOpen={toDiscard !== null}
        title={toDiscard ? formatMessage('channels.email.drafts.discardTitle', { to: toDiscard.toEmail }) : ''}
        description={t('channels.email.drafts.discardDescription')}
        confirmLabel={t('channels.email.drafts.discard')}
        cancelLabel={t('whatYouSell.form.cancel')}
        closeLabel={t('whatYouSell.form.close')}
        tone="danger"
        isConfirming={isWorking}
        onConfirm={discardDraft}
        onCancel={() => setToDiscard(null)}
      />
    </Card>
  );
}
