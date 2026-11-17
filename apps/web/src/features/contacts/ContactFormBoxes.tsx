import { TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import type { ContactFormFields, ContactFormProblems } from './contact-form';

/** The text boxes shared by the Add contact and Edit contact panels: name, phone, email and (when asked) language. */
export function ContactFormBoxes(props: {
  fields: ContactFormFields;
  problems: ContactFormProblems;
  onChange: (changes: Partial<ContactFormFields>) => void;
  showLanguage?: boolean;
}) {
  const { fields, problems, onChange, showLanguage = false } = props;
  return (
    <>
      <TextField
        label={t('contacts.form.name')}
        value={fields.name}
        onChange={(event) => onChange({ name: event.target.value })}
        autoComplete="off"
      />
      <TextField
        label={t('contacts.form.phone')}
        type="tel"
        value={fields.phone}
        onChange={(event) => onChange({ phone: event.target.value })}
        autoComplete="off"
        helperText={t('contacts.form.phoneHint')}
        {...(problems.contact ? { errorMessage: t(problems.contact) } : {})}
      />
      <TextField
        label={t('contacts.form.email')}
        type="email"
        value={fields.email}
        onChange={(event) => onChange({ email: event.target.value })}
        autoComplete="off"
        {...(problems.email ? { errorMessage: t(problems.email) } : {})}
      />
      {showLanguage ? (
        <TextField
          label={t('contacts.form.language')}
          value={fields.language}
          onChange={(event) => onChange({ language: event.target.value })}
          autoComplete="off"
          maxLength={2}
          helperText={t('contacts.form.languageHint')}
          {...(problems.language ? { errorMessage: t(problems.language) } : {})}
        />
      ) : null}
    </>
  );
}
