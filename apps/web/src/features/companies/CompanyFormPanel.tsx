import { useState, type FormEvent } from 'react';
import type { Company } from '@toobler-one/shared';
import { Alert, Button, SidePanel, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { formatMessage, t } from '../../app/i18n';
import {
  buildCompanyFormFromCompany,
  buildCreateCompanyRequest,
  buildUpdateCompanyRequest,
  checkCompanyForm,
  EMPTY_COMPANY_FORM,
  type CompanyFormFields,
  type CompanyFormProblems,
} from './company-form';
import { buildCustomRequest, answersToTexts, type CustomAnswerTexts } from '../fields/custom-answers';
import { CustomFieldInputs } from '../fields/CustomFieldInputs';
import { useFieldDefinitions } from '../fields/use-field-definitions';
import { describeCompanySaveProblem } from './company-problem';

const FORM_ID = 'company-form';

export interface CompanyFormPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** When given, the form changes this company (`PATCH /companies/{id}`) instead of adding one. */
  editingCompany?: Company;
  /** Called after the company was saved, with its name for the confirmation. */
  onSaved: (companyName: string) => void;
}

/**
 * The Add company form in a side panel: name, website domain, phone and city. It checks on the device first, then sends `POST /companies`. The
 * person adding it looks after it. Everything typed stays when something goes wrong, and a name or domain already used is said in plain words.
 */
export function CompanyFormPanel({ isOpen, onClose, editingCompany, onSaved }: CompanyFormPanelProps) {
  const [fields, setFields] = useState<CompanyFormFields>(() =>
    editingCompany ? buildCompanyFormFromCompany(editingCompany) : EMPTY_COMPANY_FORM,
  );
  const [problems, setProblems] = useState<CompanyFormProblems>({});
  const [formProblem, setFormProblem] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  // Only what the person typed into the custom boxes; every other box shows what the company has saved
  const [customEdits, setCustomEdits] = useState<CustomAnswerTexts>({});
  const definitions = useFieldDefinitions('company');
  const customTexts = { ...answersToTexts(definitions, editingCompany?.custom ?? {}), ...customEdits };
  const changeFields = (changes: Partial<CompanyFormFields>) => setFields((current) => ({ ...current, ...changes }));

  // Checks the form, sends it, and says what went wrong in plain words
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormProblem(undefined);
    const foundProblems = checkCompanyForm(fields);
    setProblems(foundProblems);
    if (Object.keys(foundProblems).length > 0) return;
    setIsSaving(true);
    try {
      if (editingCompany) {
        const custom = buildCustomRequest(definitions, customTexts, editingCompany.custom);
        const changes = { ...buildUpdateCompanyRequest(fields, editingCompany), ...(custom ? { custom } : {}) };
        // Nothing changed: no need to ask the API
        if (Object.keys(changes).length > 0)
          await apiRequest<Company>('PATCH', `/companies/${editingCompany.id}`, changes);
      } else {
        const custom = buildCustomRequest(definitions, customTexts);
        await apiRequest<Company>('POST', '/companies', {
          ...buildCreateCompanyRequest(fields),
          ...(custom ? { custom } : {}),
        });
      }
      onSaved(fields.name.trim());
    } catch (error) {
      setFormProblem(describeCompanySaveProblem(error));
      setIsSaving(false);
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingCompany
          ? formatMessage('companies.edit.title', { name: editingCompany.name })
          : t('companies.form.title')
      }
      closeLabel={t('companies.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('companies.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {editingCompany ? t('companies.edit.submit') : t('companies.form.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
        {formProblem ? <Alert tone="error">{formProblem}</Alert> : null}
        <TextField
          label={t('companies.form.name')}
          value={fields.name}
          onChange={(event) => changeFields({ name: event.target.value })}
          maxLength={120}
          autoComplete="off"
          {...(problems.name ? { errorMessage: t(problems.name) } : {})}
        />
        <TextField
          label={t('companies.form.domain')}
          requirementLabel={t('companies.form.optional')}
          value={fields.domain}
          onChange={(event) => changeFields({ domain: event.target.value })}
          autoComplete="off"
          helperText={t('companies.form.domainHint')}
          {...(problems.domain ? { errorMessage: t(problems.domain) } : {})}
        />
        <TextField
          label={t('companies.form.phone')}
          requirementLabel={t('companies.form.optional')}
          type="tel"
          value={fields.phone}
          onChange={(event) => changeFields({ phone: event.target.value })}
          maxLength={40}
          autoComplete="off"
        />
        <TextField
          label={t('companies.form.city')}
          requirementLabel={t('companies.form.optional')}
          value={fields.city}
          onChange={(event) => changeFields({ city: event.target.value })}
          maxLength={80}
          autoComplete="off"
        />
        <CustomFieldInputs
          definitions={definitions}
          texts={customTexts}
          onChange={(key, text) => setCustomEdits((current) => ({ ...current, [key]: text }))}
        />
        {editingCompany ? null : <p className="text-body-xs text-text-secondary">{t('companies.form.ownerNote')}</p>}
      </form>
    </SidePanel>
  );
}
