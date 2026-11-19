import { useState, type FormEvent } from 'react';
import type { WhatsappCheckResult, WhatsappConnection, WhatsappSettings } from '@toobler-one/shared';
import { Alert, Button, Card, ConfirmDialog, ErrorState, LoadingState, TextField } from '@toobler-one/ui';
import { apiRequest, ApiRequestError } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { describeChannelProblem } from './problem-message';
import { formatSeenAt } from './webchat-form';

/** One plain sentence for a failed WhatsApp change: the API's own words for a refusal it explained (number in use, token needed), else a general one. */
function describeWhatsappProblem(error: unknown): string {
  if (error instanceof ApiRequestError && (error.status === 409 || error.status === 400) && error.message) {
    return error.message;
  }
  return describeChannelProblem(error);
}

/**
 * Channels → WhatsApp (managers only: it shows the token fields and the verify token). Connect a number with the id and the access token from
 * Meta, see its state, "Check connection" (asks Meta, sends nothing), pause the AI's answers, disconnect (asks "Are you sure?"). The token is
 * never shown again after saving, only its last four characters.
 */
export function WhatsappCard(props: { timeZone: string }) {
  const resource = useApiResource<WhatsappSettings>('/channels/whatsapp');
  const kept = useKeptData(resource.state);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [checkResult, setCheckResult] = useState<WhatsappCheckResult | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const isOff = resource.state.status === 'error' && resource.state.httpStatus === 404;
  if (kept.isFirstLoad) return <LoadingState label={t('channels.loading')} />;
  if (isOff) {
    return (
      <Card>
        <h2 className="text-heading-sm text-text-primary">{t('channels.whatsapp.off.title')}</h2>
        <p className="text-body-md text-text-secondary">{t('channels.whatsapp.off.description')}</p>
      </Card>
    );
  }
  if (kept.hasFailed || kept.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('channels.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={resource.reload}>
              {t('knowledge.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  const settings = kept.data;
  const connection: WhatsappConnection | null = settings.connection;
  const showForm = connection === null || isEditing;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setIsWorking(true);
    setProblem(null);
    try {
      await apiRequest('PUT', '/channels/whatsapp', {
        phoneNumberId: phoneNumberId.trim() === '' ? (connection?.phoneNumberId ?? '') : phoneNumberId.trim(),
        ...(businessAccountId.trim() === '' ? {} : { businessAccountId: businessAccountId.trim() }),
        ...(accessToken.trim() === '' ? {} : { accessToken: accessToken.trim() }),
      });
      setAccessToken('');
      setPhoneNumberId('');
      setBusinessAccountId('');
      setIsEditing(false);
      setCheckResult(null);
      resource.reload();
    } catch (error) {
      setProblem(describeWhatsappProblem(error));
    } finally {
      setIsWorking(false);
    }
  };

  const check = async () => {
    setIsWorking(true);
    setProblem(null);
    try {
      setCheckResult(await apiRequest<WhatsappCheckResult>('POST', '/channels/whatsapp/check'));
      resource.reload();
    } catch (error) {
      setProblem(describeWhatsappProblem(error));
    } finally {
      setIsWorking(false);
    }
  };

  const setAnswering = async (answerMessages: boolean) => {
    if (connection === null) return;
    setIsWorking(true);
    setProblem(null);
    try {
      await apiRequest('PUT', '/channels/whatsapp', { phoneNumberId: connection.phoneNumberId, answerMessages });
      resource.reload();
    } catch (error) {
      setProblem(describeWhatsappProblem(error));
    } finally {
      setIsWorking(false);
    }
  };

  const disconnect = async () => {
    setIsWorking(true);
    try {
      await apiRequest('DELETE', '/channels/whatsapp');
      setIsDisconnecting(false);
      setCheckResult(null);
      resource.reload();
    } catch (error) {
      setProblem(describeWhatsappProblem(error));
      setIsDisconnecting(false);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Card>
      <h2 className="text-heading-sm mb-1 text-text-primary">{t('channels.whatsapp.title')}</h2>
      <p className="text-body-md mb-3 text-text-secondary">{t('channels.whatsapp.intro')}</p>

      {!settings.platformReady ? <Alert tone="error">{t('channels.whatsapp.platformNotReady')}</Alert> : null}

      {connection !== null ? (
        <div className="mb-4 flex flex-col gap-2 rounded-md bg-surface-subtle p-3" aria-live="polite">
          <p className="text-body-md text-text-primary">
            <span className="text-label-md">{t('channels.whatsapp.number')}: </span>
            {connection.displayPhoneNumber ?? t('channels.whatsapp.numberUnknown')}
            <span className="text-label-sm text-text-secondary"> ({connection.phoneNumberId})</span>
          </p>
          <p className="text-body-md text-text-primary">
            <span className="text-label-md">{t('channels.whatsapp.status')}: </span>
            {t(`channels.whatsapp.status.${connection.status}`)}
            {connection.statusNote ? <span className="text-text-secondary"> — {connection.statusNote}</span> : null}
          </p>
          <p className="text-body-md text-text-secondary">
            {connection.lastMessageAt
              ? formatMessage('channels.whatsapp.lastMessage', {
                  when: formatSeenAt(connection.lastMessageAt, props.timeZone),
                })
              : t('channels.whatsapp.noMessagesYet')}
          </p>
          <p className="text-body-md text-text-secondary">
            {connection.answerMessages ? t('channels.whatsapp.answering.on') : t('channels.whatsapp.answering.off')}
          </p>
          {connection.chatLink ? (
            <p className="text-body-md text-text-secondary">
              {t('channels.whatsapp.chatLink')}:{' '}
              <span className="font-mono text-text-primary">{connection.chatLink}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" size="compact" onClick={check} isLoading={isWorking}>
              {t('channels.whatsapp.check')}
            </Button>
            <Button
              variant="secondary"
              size="compact"
              onClick={() => setAnswering(!connection.answerMessages)}
              disabled={isWorking}
            >
              {connection.answerMessages ? t('channels.whatsapp.pause') : t('channels.whatsapp.resume')}
            </Button>
            <Button variant="tertiary" size="compact" onClick={() => setIsEditing(!isEditing)}>
              {t('channels.whatsapp.change')}
            </Button>
            <Button variant="tertiary" size="compact" onClick={() => setIsDisconnecting(true)}>
              {t('channels.whatsapp.disconnect')}
            </Button>
          </div>
          {checkResult ? <Alert tone={checkResult.ok ? 'success' : 'error'}>{checkResult.note}</Alert> : null}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <TextField
            label={t('channels.whatsapp.form.phoneNumberId')}
            helperText={t('channels.whatsapp.form.phoneNumberIdHelper')}
            value={phoneNumberId}
            onChange={(event) => setPhoneNumberId(event.target.value)}
            inputMode="numeric"
            placeholder={connection?.phoneNumberId ?? ''}
          />
          <TextField
            label={t('channels.whatsapp.form.accessToken')}
            helperText={
              connection
                ? formatMessage('channels.whatsapp.form.tokenKept', { preview: connection.tokenPreview })
                : t('channels.whatsapp.form.accessTokenHelper')
            }
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
          <TextField
            label={t('channels.whatsapp.form.businessAccountId')}
            requirementLabel={t('channels.whatsapp.form.optional')}
            value={businessAccountId}
            onChange={(event) => setBusinessAccountId(event.target.value)}
            inputMode="numeric"
          />
          <div>
            <Button type="submit" variant="primary" isLoading={isWorking}>
              {connection ? t('channels.whatsapp.form.save') : t('channels.whatsapp.form.connect')}
            </Button>
          </div>
        </form>
      ) : null}
      {problem ? (
        <Alert tone="error" className="mt-3">
          {problem}
        </Alert>
      ) : null}

      <h3 className="text-label-md mb-2 mt-6 text-text-primary">{t('channels.whatsapp.metaSteps.title')}</h3>
      <ol className="text-body-md flex flex-col gap-1 text-text-secondary">
        <li>{t('channels.whatsapp.metaSteps.one')}</li>
        <li>{t('channels.whatsapp.metaSteps.two')}</li>
        <li>{t('channels.whatsapp.metaSteps.three')}</li>
      </ol>
      {settings.webhookUrl && settings.verifyToken ? (
        <dl className="text-body-md mt-3 flex flex-col gap-2">
          <div>
            <dt className="text-label-sm text-text-primary">{t('channels.whatsapp.webhookUrl')}</dt>
            <dd className="font-mono break-all text-text-secondary">{settings.webhookUrl}</dd>
          </div>
          <div>
            <dt className="text-label-sm text-text-primary">{t('channels.whatsapp.verifyToken')}</dt>
            <dd className="font-mono break-all text-text-secondary">{settings.verifyToken}</dd>
          </div>
        </dl>
      ) : null}

      <ConfirmDialog
        isOpen={isDisconnecting}
        title={t('channels.whatsapp.disconnectTitle')}
        description={t('channels.whatsapp.disconnectDescription')}
        confirmLabel={t('channels.whatsapp.disconnect')}
        cancelLabel={t('whatYouSell.form.cancel')}
        closeLabel={t('whatYouSell.form.close')}
        tone="danger"
        isConfirming={isWorking}
        onConfirm={disconnect}
        onCancel={() => setIsDisconnecting(false)}
      />
    </Card>
  );
}
