import { useState } from 'react';
import type { Lead } from '@toobler-one/shared';
import { SelectField } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { TemperatureTag } from './TemperatureTag';
import { describeTemperatureReason, findTemperatureWord, SETTABLE_TEMPERATURES } from './temperature';

/**
 * The lead's temperature with the reason for it, and a list to set it by hand (`PATCH /leads/{id}/temperature`). What was set by hand stays
 * until the lead's next conversation is scored. A failed save says so and leaves the old temperature showing.
 */
export function LeadTemperatureRow({ lead, onSaved }: { lead: Lead; onSaved: () => void }) {
  const [problem, setProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const isClosed = lead.closedAt !== null;

  // Sends the chosen temperature; the page loads the lead again when it is saved
  async function handleChange(value: string) {
    if (value === '') return;
    setProblem(undefined);
    setIsSaving(true);
    try {
      await apiRequest('PATCH', `/leads/${lead.id}/temperature`, { temperature: value });
      onSaved();
    } catch (error) {
      setProblem(error instanceof ApiRequestError && error.status === 404 ? error.message : t('temperature.error'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <TemperatureTag temperature={lead.temperature} reason={lead.temperatureReason} />
        <span className="text-body-sm text-text-secondary">
          {describeTemperatureReason(lead.temperatureReason)}
          {lead.temperatureSetBy === 'manual' ? ` (${t('temperature.byHand')})` : ''}
        </span>
      </div>
      {isClosed ? null : (
        <SelectField
          label={t('temperature.setByHand')}
          value=""
          disabled={isSaving}
          onChange={(event) => void handleChange(event.target.value)}
          options={[
            { value: '', label: findTemperatureWord(lead.temperature) },
            ...SETTABLE_TEMPERATURES.filter((value) => value !== lead.temperature).map((value) => ({
              value,
              label: findTemperatureWord(value),
            })),
          ]}
        />
      )}
      {problem ? (
        <p role="alert" className="text-body-sm text-error">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
