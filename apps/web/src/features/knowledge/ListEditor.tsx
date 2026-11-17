import type { KnowledgeQuestion } from '@toobler-one/shared';
import { Button, SelectField, TextAreaField, TextField } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { emptyListRow, type AnswerDraft } from './answer-draft';

type ListDraft = Extract<AnswerDraft, { kind: 'list' }>;

/** A list answer (phone numbers, offerings, competitors...): one block of fields per row, with Add a row and Remove. */
export function ListEditor({
  question,
  draft,
  onChange,
}: {
  question: KnowledgeQuestion;
  draft: ListDraft;
  onChange: (draft: ListDraft) => void;
}) {
  const fields = question.rowFields ?? [];
  const canAddRow = question.maxRows === null || draft.rows.length < question.maxRows;

  const changeCell = (rowNumber: number, fieldKey: string, text: string) =>
    onChange({
      ...draft,
      rows: draft.rows.map((row, position) => (position === rowNumber ? { ...row, [fieldKey]: text } : row)),
    });

  return (
    <div className="flex flex-col gap-4">
      {draft.rows.map((row, rowNumber) => (
        <fieldset key={rowNumber} className="flex flex-col gap-3 rounded-md border border-border-default p-3">
          <legend className="text-label-sm px-1 text-text-secondary">
            {formatMessage('knowledge.editor.row', { number: rowNumber + 1 })}
          </legend>
          {fields.map((field) => {
            const label = `${field.label} (${formatMessage('knowledge.editor.row', { number: rowNumber + 1 })})`;
            const value = row[field.key] ?? '';
            if (field.kind === 'pick') {
              return (
                <SelectField
                  key={field.key}
                  label={label}
                  value={value}
                  options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
                  onChange={(event) => changeCell(rowNumber, field.key, event.target.value)}
                />
              );
            }
            if (field.kind === 'long_text') {
              return (
                <TextAreaField
                  key={field.key}
                  label={label}
                  value={value}
                  onChange={(event) => changeCell(rowNumber, field.key, event.target.value)}
                />
              );
            }
            return (
              <TextField
                key={field.key}
                label={label}
                value={value}
                inputMode={field.kind === 'price' ? 'decimal' : undefined}
                onChange={(event) => changeCell(rowNumber, field.key, event.target.value)}
              />
            );
          })}
          {draft.rows.length > 1 ? (
            <div>
              <Button
                variant="tertiary"
                size="compact"
                type="button"
                aria-label={formatMessage('knowledge.editor.removeRow', { number: rowNumber + 1 })}
                onClick={() => onChange({ ...draft, rows: draft.rows.filter((_, position) => position !== rowNumber) })}
              >
                {t('knowledge.editor.removeRow').replace('{number}', String(rowNumber + 1))}
              </Button>
            </div>
          ) : null}
        </fieldset>
      ))}
      {canAddRow ? (
        <div>
          <Button
            variant="secondary"
            size="compact"
            type="button"
            onClick={() => onChange({ ...draft, rows: [...draft.rows, emptyListRow(fields)] })}
          >
            {t('knowledge.editor.addRow')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
