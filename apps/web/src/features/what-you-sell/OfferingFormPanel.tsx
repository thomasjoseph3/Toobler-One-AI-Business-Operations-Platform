import { useState, type FormEvent } from 'react';
import type { GstMode, Offering } from '@toobler-one/shared';
import { COMMON_PRICE_UNITS } from '@toobler-one/shared';
import { Alert, Button, Checkbox, SelectField, SidePanel, TextAreaField, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import {
  buildCreateRequest,
  buildUpdateRequest,
  checkOfferingForm,
  EMPTY_OFFERING_FORM,
  isEmptyRequest,
  type OfferingFormFields,
  type OfferingFormProblems,
} from './offering-form';
import { describeChangeProblem } from './problem-message';

const FORM_ID = 'offering-form';
const OTHER_UNIT = '__other__';
const MAXIMUM_DETAILS = 10;

/** A unit the form's drop-down knows, or the "something else" choice for the owner's own words. */
const isCommonUnit = (unit: string): boolean => (COMMON_PRICE_UNITS as readonly string[]).includes(unit);

/**
 * The side panel for adding something the business sells, or changing one. `startingFields` fills it (an empty form, an offering, or a website
 * suggestion). It checks on the device first, sends only what changed when editing, and shows the API's refusal in plain words. `onSaved` runs
 * after it saved.
 */
export function OfferingFormPanel(props: {
  isOpen: boolean;
  editing: Offering | null;
  startingFields: OfferingFormFields;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { isOpen, editing, startingFields, onClose, onSaved } = props;
  const [fields, setFields] = useState<OfferingFormFields>(startingFields);
  const [unitChoice, setUnitChoice] = useState<string>(
    startingFields.priceUnit === '' || isCommonUnit(startingFields.priceUnit) ? startingFields.priceUnit : OTHER_UNIT,
  );
  const [problems, setProblems] = useState<OfferingFormProblems>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const change = (changes: Partial<OfferingFormFields>) => setFields((earlier) => ({ ...earlier, ...changes }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const found = checkOfferingForm(fields);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setIsSaving(true);
    setProblem(null);
    try {
      if (editing) {
        const request = buildUpdateRequest(editing, fields);
        if (!isEmptyRequest(request)) await apiRequest('PATCH', `/offerings/${editing.id}`, request);
      } else {
        await apiRequest('POST', '/offerings', buildCreateRequest(fields));
      }
      onSaved();
    } catch (error) {
      setProblem(describeChangeProblem(error));
      setIsSaving(false);
    }
  };

  const unitOptions = [
    ...(unitChoice === '' ? [{ value: '', label: t('whatYouSell.form.gstChoose') }] : []),
    ...COMMON_PRICE_UNITS.map((unit) => ({ value: unit, label: unit })),
    { value: OTHER_UNIT, label: t('whatYouSell.form.unitOther') },
  ];

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? formatMessage('whatYouSell.form.editTitle', { name: editing.name }) : t('whatYouSell.form.addTitle')}
      closeLabel={t('whatYouSell.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('whatYouSell.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('whatYouSell.form.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} className="flex flex-col gap-4" noValidate>
        <TextField label={t('whatYouSell.form.name')} value={fields.name} onChange={(event) => change({ name: event.target.value })} autoComplete="off" {...(problems.name ? { errorMessage: problems.name } : {})} />
        <TextAreaField label={t('whatYouSell.form.description')} value={fields.description} onChange={(event) => change({ description: event.target.value })} />
        <Checkbox label={t('whatYouSell.form.sharesPrice')} checked={fields.sharesPrice} onChange={(event) => change({ sharesPrice: event.target.checked })} />
        {fields.sharesPrice ? (
          <div className="flex flex-col gap-4 rounded-md border border-border-default p-3">
            <TextField
              label={t('whatYouSell.form.price')}
              helperText={t('whatYouSell.form.priceHelper')}
              inputMode="decimal"
              value={fields.priceRupees}
              onChange={(event) => change({ priceRupees: event.target.value })}
              {...(problems.price ? { errorMessage: problems.price } : {})}
            />
            <SelectField
              label={t('whatYouSell.form.unit')}
              value={unitChoice}
              options={unitOptions}
              onChange={(event) => {
                setUnitChoice(event.target.value);
                change({ priceUnit: event.target.value === OTHER_UNIT ? '' : event.target.value });
              }}
            />
            {unitChoice === OTHER_UNIT ? (
              <TextField label={t('whatYouSell.form.unitCustom')} value={fields.priceUnit} onChange={(event) => change({ priceUnit: event.target.value })} />
            ) : null}
            {problems.priceUnit ? <p className="text-label-sm text-error">{problems.priceUnit}</p> : null}
            <SelectField
              label={t('whatYouSell.form.gst')}
              value={fields.gstMode}
              options={[
                { value: '', label: t('whatYouSell.form.gstChoose') },
                { value: 'included', label: t('whatYouSell.form.gst.included') },
                { value: 'plus', label: t('whatYouSell.form.gst.plus') },
                { value: 'none', label: t('whatYouSell.form.gst.none') },
              ]}
              onChange={(event) => change({ gstMode: event.target.value as GstMode | '' })}
            />
            {problems.gstMode ? <p className="text-label-sm text-error">{problems.gstMode}</p> : null}
          </div>
        ) : null}
        <TextField label={t('whatYouSell.form.season')} helperText={t('whatYouSell.form.seasonHelper')} value={fields.seasonNote} onChange={(event) => change({ seasonNote: event.target.value })} />
        <TextField label={t('whatYouSell.form.includes')} value={fields.includes} onChange={(event) => change({ includes: event.target.value })} />
        <fieldset className="flex flex-col gap-3">
          <legend className="text-label-md text-text-primary">{t('whatYouSell.form.details')}</legend>
          {fields.details.map((detail, position) => (
            <div key={position} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <TextField
                label={formatMessage('whatYouSell.form.detailLabel', { number: position + 1 })}
                value={detail.label}
                onChange={(event) => change({ details: fields.details.map((row, rowPosition) => (rowPosition === position ? { ...row, label: event.target.value } : row)) })}
              />
              <TextField
                label={formatMessage('whatYouSell.form.detailValue', { number: position + 1 })}
                value={detail.value}
                onChange={(event) => change({ details: fields.details.map((row, rowPosition) => (rowPosition === position ? { ...row, value: event.target.value } : row)) })}
              />
              <Button type="button" variant="tertiary" size="compact" aria-label={formatMessage('whatYouSell.form.removeDetail', { number: position + 1 })} onClick={() => change({ details: fields.details.filter((_row, rowPosition) => rowPosition !== position) })}>
                ✕
              </Button>
            </div>
          ))}
          {problems.details ? <p className="text-label-sm text-error">{problems.details}</p> : null}
          {fields.details.length < MAXIMUM_DETAILS ? (
            <div>
              <Button type="button" variant="secondary" size="compact" onClick={() => change({ details: [...fields.details, { label: '', value: '' }] })}>
                {t('whatYouSell.form.addDetail')}
              </Button>
            </div>
          ) : null}
        </fieldset>
        <Checkbox label={t('whatYouSell.form.active')} checked={fields.active} onChange={(event) => change({ active: event.target.checked })} />
        {problem ? <Alert tone="error">{problem}</Alert> : null}
      </form>
    </SidePanel>
  );
}

export { EMPTY_OFFERING_FORM };
