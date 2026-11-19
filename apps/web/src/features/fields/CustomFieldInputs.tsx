import type { FieldDefinition } from '@toobler-one/shared';
import { SelectField, TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import type { CustomAnswerTexts } from './custom-answers';

/**
 * One box for each custom field of an object, in the field's own kind: text, number, date, phone and email boxes, a list for a dropdown, and a
 * Yes / No list. Used in the add and edit forms of contacts (and later companies and leads). An empty box means "no answer".
 */
export function CustomFieldInputs(props: {
  definitions: readonly FieldDefinition[];
  texts: Readonly<CustomAnswerTexts>;
  onChange: (key: string, text: string) => void;
}) {
  const { definitions, texts, onChange } = props;
  return (
    <>
      {definitions.map((definition) => {
        const text = texts[definition.key] ?? '';
        if (definition.type === 'dropdown') {
          return (
            <SelectField
              key={definition.id}
              label={definition.label}
              value={text}
              onChange={(event) => onChange(definition.key, event.target.value)}
              options={[
                { value: '', label: t('fields.answer.none') },
                ...definition.options.map((option) => ({ value: option, label: option })),
              ]}
            />
          );
        }
        if (definition.type === 'yes_no') {
          return (
            <SelectField
              key={definition.id}
              label={definition.label}
              value={text}
              onChange={(event) => onChange(definition.key, event.target.value)}
              options={[
                { value: '', label: t('fields.answer.none') },
                { value: 'yes', label: t('fields.answer.yes') },
                { value: 'no', label: t('fields.answer.no') },
              ]}
            />
          );
        }
        const inputType =
          definition.type === 'date'
            ? 'date'
            : definition.type === 'phone'
              ? 'tel'
              : definition.type === 'email'
                ? 'email'
                : 'text';
        return (
          <TextField
            key={definition.id}
            label={definition.label}
            type={inputType}
            {...(definition.type === 'number' ? { inputMode: 'decimal' as const } : {})}
            value={text}
            onChange={(event) => onChange(definition.key, event.target.value)}
            autoComplete="off"
          />
        );
      })}
    </>
  );
}
