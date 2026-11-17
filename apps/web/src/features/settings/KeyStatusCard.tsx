import type { AiPlatformAccess, AiPlatformUsage } from '@toobler-one/shared';
import { Alert, Card } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { describeWhichKeysAnswer, describePlatformUsage, percentOfCapUsed } from './ai-key-state';

/** Which keys are answering for the business, plus the platform's allowance and how much is used. Nothing is chosen here: the platform team decides the platform's part. */
export function KeyStatusCard(props: { access: AiPlatformAccess; usage: AiPlatformUsage | null; ownKeyCount: number }) {
  const { access, usage, ownKeyCount } = props;
  const statusKey = describeWhichKeysAnswer(access, ownKeyCount);
  const platformLines = usage ? describePlatformUsage(usage) : [];
  // The end date arrives as a day or a moment; it is shown as "31 Dec 2026"
  const showDay = (value: string | number): string | number => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value.slice(0, 10))) : value);
  const nearlyUsedUp = usage !== null && percentOfCapUsed(usage) >= 80;

  return (
    <Card>
      <h2 className="text-heading-sm mb-2 text-text-primary">{t('settings.ai.status.title')}</h2>
      {statusKey === 'settings.ai.status.nothing' ? <Alert tone="error">{t(statusKey)}</Alert> : <p className="text-body-md text-text-secondary">{t(statusKey)}</p>}
      {nearlyUsedUp && ownKeyCount === 0 ? <p className="text-label-sm mt-2 text-text-secondary">{t('settings.ai.status.addOwn')}</p> : null}
      <h3 className="text-label-md mb-1 mt-5 text-text-primary">{t('settings.ai.platform.title')}</h3>
      {usage ? (
        <>
          <ul className="text-body-md flex flex-col gap-1 text-text-secondary">
            {platformLines.map((line) => (
              <li key={line.key}>{formatMessage(line.key, Object.fromEntries(Object.entries(line.values).map(([name, value]) => [name, name === 'date' ? showDay(value) : value])))}</li>
            ))}
          </ul>
          {usage.monthlyCallCap !== null || usage.monthlyTokenCap !== null ? (
            <div role="progressbar" aria-label={t('settings.ai.platform.bar')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentOfCapUsed(usage)} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
              <div className="h-full rounded-full bg-action" style={{ width: `${percentOfCapUsed(usage)}%` }} />
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
