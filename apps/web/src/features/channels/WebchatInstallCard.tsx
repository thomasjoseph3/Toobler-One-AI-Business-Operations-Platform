import { useState, type FormEvent } from 'react';
import type { WebchatSettings } from '@toobler-one/shared';
import { Alert, Button, Card, ConfirmDialog, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeChannelProblem } from './problem-message';
import { addWebsite, describeInstallation, formatSeenAt } from './webchat-form';

/**
 * Putting the chat on the website: the one line to copy, the websites that may show it (add and remove; each change is saved at once, and
 * removing asks "Are you sure?"), and "Check the installation" (where and when the bubble was last seen working). Managers change the list; staff read.
 */
export function WebchatInstallCard(props: {
  settings: WebchatSettings;
  canEdit: boolean;
  timeZone: string;
  onChanged: () => void;
}) {
  const { settings, canEdit, timeZone, onChanged } = props;
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [typedWebsite, setTypedWebsite] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const installation = describeInstallation(settings);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(settings.snippet);
      setCopyMessage(t('channels.webchat.install.copied'));
    } catch {
      setCopyMessage(t('channels.webchat.install.copyFailed'));
    }
  };

  const saveList = async (list: string[]) => {
    setIsSaving(true);
    setProblem(null);
    try {
      await apiRequest('PATCH', '/channels/webchat', { allowedWebsites: list });
      onChanged();
      return true;
    } catch (error) {
      setProblem(describeChannelProblem(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const result = addWebsite(settings.allowedWebsites, typedWebsite);
    if (!result.ok) {
      setProblem(result.message);
      return;
    }
    if (await saveList(result.list)) setTypedWebsite('');
  };

  const confirmRemove = async () => {
    if (toRemove === null) return;
    await saveList(settings.allowedWebsites.filter((website) => website !== toRemove));
    setToRemove(null);
  };

  return (
    <Card>
      <h2 className="text-heading-sm mb-3 text-text-primary">{t('channels.webchat.install.title')}</h2>
      <ol className="text-body-md flex flex-col gap-1 text-text-secondary">
        <li>{t('channels.webchat.install.step1')}</li>
        <li>{t('channels.webchat.install.step2')}</li>
        <li>{t('channels.webchat.install.step3')}</li>
      </ol>
      <div className="mt-3 flex flex-col gap-2">
        <label htmlFor="webchat-snippet" className="text-label-sm text-text-primary">
          {t('channels.webchat.install.lineLabel')}
        </label>
        <textarea
          id="webchat-snippet"
          readOnly
          rows={3}
          value={settings.snippet}
          onFocus={(event) => event.currentTarget.select()}
          className="text-body-sm w-full rounded-md border border-border-default bg-surface-subtle p-3 font-mono text-text-primary"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="compact" onClick={copy}>
            {t('channels.webchat.install.copy')}
          </Button>
          <span role="status" className="text-label-sm text-text-secondary">
            {copyMessage}
          </span>
        </div>
      </div>

      <h3 className="text-label-md mb-2 mt-6 text-text-primary">{t('channels.webchat.websites.title')}</h3>
      {settings.allowedWebsites.length === 0 ? (
        <p className="text-body-md text-text-secondary">{t('channels.webchat.websites.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {settings.allowedWebsites.map((website) => (
            <li
              key={website}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-subtle px-3 py-2"
            >
              <span className="text-body-md text-text-primary">{website}</span>
              {canEdit ? (
                <Button
                  variant="tertiary"
                  size="compact"
                  disabled={isSaving}
                  onClick={() => setToRemove(website)}
                  aria-label={formatMessage('channels.webchat.websites.remove', { website })}
                >
                  {t('channels.webchat.websites.removeButton')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form onSubmit={add} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            label={t('channels.webchat.websites.addLabel')}
            helperText={t('channels.webchat.websites.addHelper')}
            value={typedWebsite}
            onChange={(event) => setTypedWebsite(event.target.value)}
            inputMode="url"
            className="sm:flex-1"
          />
          <Button type="submit" variant="primary" isLoading={isSaving}>
            {t('channels.webchat.websites.add')}
          </Button>
        </form>
      ) : null}
      {problem ? (
        <Alert tone="error" className="mt-3">
          {problem}
        </Alert>
      ) : null}

      <h3 className="text-label-md mb-2 mt-6 text-text-primary">{t('channels.webchat.check.title')}</h3>
      <div aria-live="polite" className="flex flex-col gap-3">
        {installation.kind === 'seen' ? (
          <Alert tone="success">
            {formatMessage('channels.webchat.check.seen', {
              website: installation.website,
              when: formatSeenAt(installation.at, timeZone),
            })}
          </Alert>
        ) : (
          <p className="text-body-md text-text-secondary">
            {t(
              installation.kind === 'no_websites'
                ? 'channels.webchat.check.noWebsites'
                : 'channels.webchat.check.never',
            )}
          </p>
        )}
        <div>
          <Button variant="secondary" size="compact" onClick={onChanged}>
            {t('channels.webchat.check.button')}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={toRemove !== null}
        title={toRemove ? formatMessage('channels.webchat.websites.removeTitle', { website: toRemove }) : ''}
        description={t('channels.webchat.websites.removeDescription')}
        confirmLabel={t('channels.webchat.websites.removeConfirm')}
        cancelLabel={t('whatYouSell.form.cancel')}
        closeLabel={t('whatYouSell.form.close')}
        tone="danger"
        isConfirming={isSaving}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </Card>
  );
}
