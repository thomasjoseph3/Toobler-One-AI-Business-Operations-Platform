import { TextAreaField, TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import type { LeadDetailsFields, LeadFormProblems } from './lead-form';

export interface LeadDetailsFormFieldsProps {
  fields: LeadDetailsFields;
  problems: LeadFormProblems;
  onChange: (changes: Partial<LeadDetailsFields>) => void;
  /** Also shows "What we promised" (the lead page edits it; the Create lead form does not ask for it). */
  showPromise?: boolean;
}

/**
 * The boxes for a lead's details: what they want, from and to dates, number of people, budget in rupees, a callback date and
 * time, and (on the lead page) what was promised. Shared by Create lead and by editing a lead, so both look and check alike.
 */
export function LeadDetailsFormFields({ fields, problems, onChange, showPromise = false }: LeadDetailsFormFieldsProps) {
  return (
    <>
      <TextAreaField
        label={t('leadForm.interest')}
        requirementLabel={t('leadForm.optional')}
        maxLength={1000}
        value={fields.interest}
        onChange={(event) => onChange({ interest: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('leadForm.dateFrom')}
          type="date"
          value={fields.dateFrom}
          onChange={(event) => onChange({ dateFrom: event.target.value })}
        />
        <TextField
          label={t('leadForm.dateTo')}
          type="date"
          value={fields.dateTo}
          onChange={(event) => onChange({ dateTo: event.target.value })}
          {...(problems.dateTo ? { errorMessage: t(problems.dateTo) } : {})}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('leadForm.partySize')}
          inputMode="numeric"
          value={fields.partySize}
          onChange={(event) => onChange({ partySize: event.target.value })}
          {...(problems.partySize ? { errorMessage: t(problems.partySize) } : {})}
        />
        <TextField
          label={t('leadForm.budget')}
          inputMode="decimal"
          value={fields.budget}
          onChange={(event) => onChange({ budget: event.target.value })}
          {...(problems.budget ? { errorMessage: t(problems.budget) } : {})}
        />
      </div>
      <TextField
        label={t('leadForm.callbackAt')}
        requirementLabel={t('leadForm.optional')}
        type="datetime-local"
        value={fields.callbackAt}
        onChange={(event) => onChange({ callbackAt: event.target.value })}
        {...(problems.callbackAt ? { errorMessage: t(problems.callbackAt) } : {})}
      />
      {showPromise ? (
        <TextAreaField
          label={t('leadPage.promise')}
          requirementLabel={t('leadForm.optional')}
          maxLength={500}
          value={fields.promise}
          onChange={(event) => onChange({ promise: event.target.value })}
        />
      ) : null}
    </>
  );
}
