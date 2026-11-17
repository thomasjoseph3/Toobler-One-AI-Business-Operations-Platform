import { useState } from 'react';
import type { AiKeyMode, AiPlatformAccess, AiPlatformUsage } from '@toobler-one/shared';
import { Alert, Card } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { describeModeWarning, describePlatformUsage, KEY_MODES, percentOfCapUsed } from './ai-key-state';
import { describeSettingsProblem } from './problem-message';

/** Which keys the AI uses (own, platform's, or own then platform's), with a warning when the choice would leave nothing to answer with, and what the platform allows. */
export function KeyModeCard(props: { keyMode: AiKeyMode; access: AiPlatformAccess; usage: AiPlatformUsage | null; ownKeyCount: number; onChanged: () => void }) {
  const { keyMode, access, usage, ownKeyCount, onChanged } = props;
  const [chosen, setChosen] = useState<AiKeyMode>(keyMode);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const warning = describeModeWarning(chosen, access, ownKeyCount);
  const platformLines = usage ? describePlatformUsage(usage) : [];
  // The end date arrives as a day or a moment; it is shown as "31 Dec 2026"
  const showDay = (value: string | number): string | number => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value.slice(0, 10))) : value);

  const choose = async (mode: AiKeyMode) => {
    setChosen(mode);
    setProblem(null);
    setIsSaved(false);
    try {
      await apiRequest('PUT', '/ai/settings', { keyMode: mode });
      setIsSaved(true);
      onChanged();
    } catch (error) {
      setChosen(keyMode);
      setProblem(describeSettingsProblem(error));
    }
  };

  return (
    <Card>
      <h2 className="text-heading-sm mb-2 text-text-primary">{t('settings.ai.mode.title')}</h2>
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t('settings.ai.mode.title')}</legend>
        {KEY_MODES.map((option) => (
          <label key={option.mode} className="flex cursor-pointer items-start gap-3">
            <input type="radio" name="key-mode" value={option.mode} checked={chosen === option.mode} onChange={() => void choose(option.mode)} className="mt-1 size-4 accent-[var(--color-action)]" />
            <span>
              <span className="text-body-md block text-text-primary">{t(option.labelKey)}</span>
              <span className="text-label-sm block text-text-secondary">{t(option.helpKey)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-3 flex flex-col gap-3" aria-live="polite">
        {isSaved ? <Alert tone="success">{t('settings.ai.mode.saved')}</Alert> : null}
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {warning ? <Alert tone="error">{t(warning)}</Alert> : null}
      </div>
      <h3 className="text-label-md mb-1 mt-5 text-text-primary">{t('settings.ai.platform.title')}</h3>
      {usage ? (
        <>
          <ul className="text-body-md flex flex-col gap-1 text-text-secondary">
            {platformLines.map((line) => (
              <li key={line.key}>{formatMessage(line.key, Object.fromEntries(Object.entries(line.values).map(([name, value]) => [name, name === 'date' ? showDay(value) : value])))}</li>
            ))}
          </ul>
          {usage.monthlyCallCap !== null ? (
            <div role="progressbar" aria-label={t('settings.ai.platform.bar')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentOfCapUsed(usage)} className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
              <div className="h-full rounded-full bg-action" style={{ width: `${percentOfCapUsed(usage)}%` }} />
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
