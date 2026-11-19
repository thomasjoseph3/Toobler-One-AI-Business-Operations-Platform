import { useState, type FormEvent } from 'react';
import type { FieldDefinition, FieldObject } from '@toobler-one/shared';
import { Alert, Button, Checkbox, SelectField, SidePanel, TextAreaField, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import {
  buildCreateFieldRequest,
  buildFieldFormFromField,
  buildUpdateFieldRequest,
  buildEmptyFieldForm,
  checkFieldForm,
  describeFieldProblem,
  FIELD_TYPE_CHOICES,
  type FieldFormFields,
  type FieldFormProblems,
} from './fields-state';

const FORM_ID = 'field-form';

export interface FieldFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which object the field is for (the tab the person is on). */
  object: FieldObject;
  /** The field being changed; left out when adding a new one. Its type cannot be changed. */
  field?: FieldDefinition;
  /** Called after the field was saved, with its label for the confirmation. */
  onSaved: (label: string) => void;
}

/**
 * The Add field form in a side panel: a label, a type, the choices (for a dropdown, one to a line), whether the AI should ask for it and (leads only)
 * whether it is required before Won. It checks on the device first, then sends `POST /fields`. Everything typed stays when something goes wrong.
 */
export function FieldFormPanel({ isOpen, onClose, object, field, onSaved }: FieldFormPanelProps) {
  const isChanging = field !== undefined;
  const [fields, setFields] = useState<FieldFormFields>(() =>
    field ? buildFieldFormFromField(field) : buildEmptyFieldForm(),
  );
  const [problems, setProblems] = useState<FieldFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const changeFields = (changes: Partial<FieldFormFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkFieldForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    setIsSaving(true);
    try {
      if (field) {
        await apiRequest<FieldDefinition>('PATCH', `/fields/${field.id}`, buildUpdateFieldRequest(fields, object));
      } else {
        await apiRequest<FieldDefinition>('POST', '/fields', buildCreateFieldRequest(fields, object));
      }
      onSaved(fields.label.trim());
    } catch (error) {
      setFormProblem(describeFieldProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={isChanging ? t('fields.form.changeTitle') : t('fields.form.title')}
      closeLabel={t('fields.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('fields.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {isChanging ? t('fields.form.save') : t('fields.form.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('fields.form.label')}
          value={fields.label}
          onChange={(event) => changeFields({ label: event.target.value })}
          maxLength={80}
          autoComplete="off"
          helperText={t('fields.form.labelHint')}
          {...(problems.label ? { errorMessage: t(problems.label) } : {})}
        />
        <SelectField
          label={t('fields.form.type')}
          value={fields.type}
          onChange={(event) =>
            changeFields({
              type: FIELD_TYPE_CHOICES.find((choice) => choice.type === event.target.value)?.type ?? 'text',
            })
          }
          options={FIELD_TYPE_CHOICES.map((choice) => ({ value: choice.type, label: t(choice.labelKey) }))}
          disabled={isChanging}
        />
        {isChanging ? <p className="text-body-sm -mt-2 text-text-secondary">{t('fields.form.typeFixed')}</p> : null}
        {fields.type === 'dropdown' ? (
          <TextAreaField
            label={t('fields.form.options')}
            value={fields.optionsText}
            onChange={(event) => changeFields({ optionsText: event.target.value })}
            rows={5}
            helperText={t('fields.form.optionsHint')}
            {...(problems.options ? { errorMessage: t(problems.options) } : {})}
          />
        ) : null}
        <Checkbox
          label={t('fields.form.aiAsks')}
          checked={fields.aiAsks}
          onChange={(event) => changeFields({ aiAsks: event.target.checked })}
        />
        {object === 'lead' ? (
          <Checkbox
            label={t('fields.form.requiredForWon')}
            checked={fields.requiredForWon}
            onChange={(event) => changeFields({ requiredForWon: event.target.checked })}
          />
        ) : null}
      </form>
    </SidePanel>
  );
}
