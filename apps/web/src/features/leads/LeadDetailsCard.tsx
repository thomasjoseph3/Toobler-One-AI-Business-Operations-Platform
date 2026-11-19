import { useState, type FormEvent, type ReactNode } from 'react';
import type { Lead } from '@toobler-one/shared';
import { Alert, Button, Card } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import { formatBudget, formatLeadDate, formatMoment } from './lead-display';
import {
  buildLeadChanges,
  checkLeadDetails,
  leadToDetailsFields,
  type LeadDetailsFields,
  type LeadFormProblems,
} from './lead-form';
import { LeadDetailsFormFields } from './LeadDetailsFormFields';
import { answersToTexts, buildCustomRequest, describeAnswer, type CustomAnswerTexts } from '../fields/custom-answers';
import { CustomFieldInputs } from '../fields/CustomFieldInputs';
import { useFieldDefinitions } from '../fields/use-field-definitions';

/** One line of the facts list: a small label and the value, or "Not set". */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-sm text-text-secondary">{label}</dt>
      <dd className="text-body-md text-text-primary">{children ?? t('leadPage.notSet')}</dd>
    </div>
  );
}

/** The dates as one phrase: "20 Dec 2026 to 23 Dec 2026", "From 20 Dec 2026", "Until 23 Dec 2026", or nothing. */
function describeDates(lead: Lead): string | null {
  const from = formatLeadDate(lead.dateFrom);
  const to = formatLeadDate(lead.dateTo);
  if (from && to) return formatMessage('leadPage.dates.range', { from, to });
  if (from) return formatMessage('leadPage.dates.from', { from });
  if (to) return formatMessage('leadPage.dates.until', { to });
  return null;
}

export interface LeadDetailsCardProps {
  lead: Lead;
  /** The business's time zone: the callback is shown and edited in it. */
  timeZone: string;
  /** Called after the changes were saved, so the page loads the lead again and says so. */
  onSaved: () => void;
}

/**
 * The lead's details (what they want, dates, party size, budget, callback, what was promised) with an "Edit details" button
 * that turns the card into the same form as Create lead. Saving sends only what changed (`PATCH /leads/{id}`); nothing is
 * sent when nothing changed. The checks run on the device first, and what was typed stays when the API refuses.
 */
export function LeadDetailsCard({ lead, timeZone, onSaved }: LeadDetailsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState<LeadDetailsFields>(() => leadToDetailsFields(lead, timeZone));
  const [problems, setProblems] = useState<LeadFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  // Only what the person typed into the custom boxes; every other box shows what the lead has saved
  const [customEdits, setCustomEdits] = useState<CustomAnswerTexts>({});
  const definitions = useFieldDefinitions('lead');
  const customTexts = { ...answersToTexts(definitions, lead.custom), ...customEdits };

  // Opens the form with the lead's current details
  const startEditing = () => {
    setFields(leadToDetailsFields(lead, timeZone));
    setCustomEdits({});
    setProblems({});
    setFormProblem(undefined);
    setIsEditing(true);
  };

  // Saves: checks first, sends only the changed fields, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkLeadDetails(fields, timeZone);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    const custom = buildCustomRequest(definitions, customTexts, lead.custom);
    const changes = { ...buildLeadChanges(lead, fields, timeZone), ...(custom ? { custom } : {}) };
    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await apiRequest('PATCH', `/leads/${lead.id}`, changes);
      setIsEditing(false);
      onSaved();
    } catch (error) {
      const known = error instanceof ApiRequestError && (error.status === 400 || error.status === 409);
      setFormProblem(known ? error.message : t('leads.error.unknown'));
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing) {
    return (
      <Card>
        <h3 className="text-heading-md mb-4 text-text-primary">{t('leadPage.details.heading')}</h3>
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
          {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
          <LeadDetailsFormFields
            fields={fields}
            problems={problems}
            onChange={(changes) => setFields((current) => ({ ...current, ...changes }))}
            showPromise
          />
          <CustomFieldInputs
            definitions={definitions}
            texts={customTexts}
            onChange={(key, text) => setCustomEdits((current) => ({ ...current, [key]: text }))}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsEditing(false)}>{t('leadForm.cancel')}</Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
              {t('leadPage.details.save')}
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-heading-md text-text-primary">{t('leadPage.details.heading')}</h3>
        <Button size="compact" onClick={startEditing}>
          {t('leadPage.details.edit')}
        </Button>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Fact label={t('leadPage.details.interest')}>{lead.interest}</Fact>
        </div>
        <Fact label={t('leadPage.details.dates')}>{describeDates(lead)}</Fact>
        <Fact label={t('leadPage.details.partySize')}>{lead.partySize}</Fact>
        <Fact label={t('leadPage.details.budget')}>{formatBudget(lead.budgetPaise)}</Fact>
        <Fact label={t('leadPage.details.callback')}>{formatMoment(lead.callbackAt, timeZone)}</Fact>
        <div className="sm:col-span-2">
          <Fact label={t('leadPage.details.promise')}>{lead.promise}</Fact>
        </div>
        {definitions.map((definition) => (
          <Fact key={definition.id} label={definition.label}>
            {describeAnswer(definition, lead.custom[definition.key])}
          </Fact>
        ))}
      </dl>
    </Card>
  );
}
