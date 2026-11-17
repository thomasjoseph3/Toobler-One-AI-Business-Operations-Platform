import { useState, type FormEvent } from 'react';
import type { BusinessSettings } from '@toobler-one/shared';
import { Alert, Button, Card, SelectField, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { describeSaveProblem } from './problem-message';

/** The time zones offered first. The business's own is always in the list, even when it is not one of these. */
const COMMON_TIME_ZONES: readonly string[] = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Muscat',
  'Asia/Qatar',
  'Asia/Riyadh',
  'Asia/Singapore',
  'Asia/Colombo',
  'Europe/London',
  'America/New_York',
  'Australia/Sydney',
];

/** The options for the time zone drop-down: the common ones, and the business's own if it is not among them. */
export function timeZoneOptions(current: string): { value: string; label: string }[] {
  const zones = COMMON_TIME_ZONES.includes(current) ? COMMON_TIME_ZONES : [current, ...COMMON_TIME_ZONES];
  return zones.map((zone) => ({ value: zone, label: zone.replace('_', ' ') }));
}

/** The business's time zone, the country phone numbers belong to, and how fast it promises to call back. Managers change them; staff only read. */
export function BusinessSettingsCard({
  settings,
  canEdit,
  onSaved,
}: {
  settings: BusinessSettings;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [country, setCountry] = useState(settings.defaultCountry);
  const [callbackMinutes, setCallbackMinutes] = useState(String(settings.callbackPromiseMinutes));
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const minutes = Number(callbackMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
      setProblem(t('knowledge.settings.callbackHelper'));
      return;
    }
    setIsSaving(true);
    setProblem(null);
    setIsSaved(false);
    try {
      // Only what changed is sent
      const changes: Record<string, unknown> = {};
      if (timeZone !== settings.timeZone) changes['timeZone'] = timeZone;
      if (country.trim().toUpperCase() !== settings.defaultCountry) changes['defaultCountry'] = country.trim();
      if (minutes !== settings.callbackPromiseMinutes) changes['callbackPromiseMinutes'] = minutes;
      if (Object.keys(changes).length > 0) await apiRequest('PUT', '/knowledge/settings', changes);
      setIsSaved(true);
      onSaved();
    } catch (error) {
      setProblem(describeSaveProblem(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <h2 className="text-heading-sm mb-3 text-text-primary">{t('knowledge.settings.title')}</h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            label={t('knowledge.settings.timeZone')}
            value={timeZone}
            options={timeZoneOptions(settings.timeZone)}
            onChange={(event) => setTimeZone(event.target.value)}
            disabled={!canEdit}
          />
          <TextField
            label={t('knowledge.settings.country')}
            helperText={t('knowledge.settings.countryHelper')}
            value={country}
            maxLength={2}
            onChange={(event) => setCountry(event.target.value)}
            disabled={!canEdit}
          />
          <TextField
            label={t('knowledge.settings.callback')}
            helperText={t('knowledge.settings.callbackHelper')}
            type="number"
            inputMode="numeric"
            value={callbackMinutes}
            onChange={(event) => setCallbackMinutes(event.target.value)}
            disabled={!canEdit}
          />
        </div>
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {isSaved ? <Alert tone="success">{t('knowledge.settings.saved')}</Alert> : null}
        {canEdit ? (
          <div>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              {t('knowledge.settings.save')}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
