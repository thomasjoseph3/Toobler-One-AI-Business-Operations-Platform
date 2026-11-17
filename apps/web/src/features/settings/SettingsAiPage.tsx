import type { AiKeysResponse, AiSettings, AiUsageResponse } from '@toobler-one/shared';
import { Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { AiKeysCard } from './AiKeysCard';
import { KeyStatusCard } from './KeyStatusCard';
import { SettingsTabs } from './SettingsTabs';

/**
 * Settings → AI: which keys are in use (own first, then the platform's if the platform team allows it) with the allowance and what was used, the business's own keys
 * (add, test, delete) and what the AI used this month. Only managers may use it (the AI routes are manager-only). It keeps what is on screen
 * while a change reloads, and has loading and error states.
 */
export function SettingsAiPage() {
  const { sessionState } = useSession();
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <SettingsTabs />
      <p className="text-body-md text-text-secondary">{t('settings.ai.intro')}</p>
      {isManager ? (
        <ManagerAiSettings />
      ) : (
        <p className="text-body-md text-text-secondary">{t('settings.managersOnly')}</p>
      )}
    </div>
  );
}

/** The part of the page that asks the manager-only routes, so nobody else's browser ever asks them. */
function ManagerAiSettings() {
  const settingsResource = useApiResource<AiSettings>('/ai/settings');
  const keysResource = useApiResource<AiKeysResponse>('/ai/keys');
  const usageResource = useApiResource<AiUsageResponse>('/ai/usage');
  const settings = useKeptData(settingsResource.state);
  const keys = useKeptData(keysResource.state);
  const usage = useKeptData(usageResource.state);
  const reloadAll = () => {
    settingsResource.reload();
    keysResource.reload();
    usageResource.reload();
  };

  if (settings.isFirstLoad || keys.isFirstLoad) return <LoadingState label={t('settings.loading')} />;
  if (settings.hasFailed || keys.hasFailed || settings.data === null || keys.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('settings.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={reloadAll}>
              {t('knowledge.retry')}
            </Button>
          }
        />
      </Card>
    );
  }
  return (
    <>
      <KeyStatusCard
        access={settings.data.platformAccess}
        usage={usage.data?.platform ?? null}
        ownKeyCount={keys.data.items.length}
      />
      <AiKeysCard keys={keys.data.items} onChanged={reloadAll} />
      {usage.data ? (
        <Card>
          <h2 className="text-heading-sm mb-2 text-text-primary">{t('settings.ai.usage.title')}</h2>
          <dl className="text-body-md grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            <dt className="text-text-secondary">{t('settings.ai.usage.calls')}</dt>
            <dd className="text-text-primary">
              {formatMessage('settings.ai.usage.number', { number: usage.data.totals.calls })}
            </dd>
            <dt className="text-text-secondary">{t('settings.ai.usage.failures')}</dt>
            <dd className="text-text-primary">
              {formatMessage('settings.ai.usage.number', { number: usage.data.totals.failures })}
            </dd>
            <dt className="text-text-secondary">{t('settings.ai.usage.fallbacks')}</dt>
            <dd className="text-text-primary">
              {formatMessage('settings.ai.usage.number', { number: usage.data.totals.fallbacks })}
            </dd>
          </dl>
        </Card>
      ) : null}
    </>
  );
}
