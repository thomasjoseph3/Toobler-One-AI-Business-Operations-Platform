import { useState, type FormEvent } from 'react';
import { Alert, Button, SelectField, SidePanel, TextField } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { t } from '../../app/i18n';
import { AI_PROVIDERS, buildAddKeyRequest, checkKeyForm, EMPTY_KEY_FORM, PROVIDER_WORDS, type KeyFormFields, type KeyFormProblems } from './ai-key-state';
import { describeSettingsProblem } from './problem-message';

const FORM_ID = 'add-key-form';

/** The side panel for saving an AI key. It checks on the device first; the key is sent once and cleared from the page at once (it is never shown again). */
export function AddKeyPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<KeyFormFields>(EMPTY_KEY_FORM);
  const [problems, setProblems] = useState<KeyFormProblems>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const found = checkKeyForm(fields);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    setIsSaving(true);
    setProblem(null);
    try {
      await apiRequest('POST', '/ai/keys', buildAddKeyRequest(fields));
      setFields(EMPTY_KEY_FORM); // the key leaves the page the moment it is saved
      onSaved();
    } catch (error) {
      setProblem(describeSettingsProblem(error));
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen
      onClose={onClose}
      title={t('settings.ai.form.title')}
      closeLabel={t('settings.ai.form.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('settings.ai.form.cancel')}</Button>
          <Button type="submit" form={FORM_ID} variant="primary" isLoading={isSaving}>
            {t('settings.ai.form.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={save} className="flex flex-col gap-4" noValidate autoComplete="off">
        <SelectField label={t('settings.ai.form.provider')} value={fields.provider} options={AI_PROVIDERS.map((provider) => ({ value: provider, label: t(PROVIDER_WORDS[provider]) }))} onChange={(event) => setFields({ ...fields, provider: event.target.value as KeyFormFields['provider'] })} />
        <TextField label={t('settings.ai.form.label')} helperText={t('settings.ai.form.labelHelper')} value={fields.label} onChange={(event) => setFields({ ...fields, label: event.target.value })} {...(problems.label ? { errorMessage: problems.label } : {})} />
        <TextField label={t('settings.ai.form.key')} helperText={t('settings.ai.form.keyHelper')} type="password" autoComplete="off" spellCheck={false} value={fields.key} onChange={(event) => setFields({ ...fields, key: event.target.value })} {...(problems.key ? { errorMessage: problems.key } : {})} />
        <p className="text-label-sm text-text-secondary">{t('settings.ai.keys.neverShown')}</p>
        {problem ? <Alert tone="error">{problem}</Alert> : null}
      </form>
    </SidePanel>
  );
}
