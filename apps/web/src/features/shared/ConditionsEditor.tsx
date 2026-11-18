import { useState } from 'react';
import type { FilterableField, FilterCondition, FilterOperator } from '@toobler-one/shared';
import { operatorNeedsValue } from '@toobler-one/shared';
import { Button, SelectField, TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import {
  changeConditionField,
  changeConditionOperator,
  describeChoice,
  describeOperator,
  listOperatorsFor,
  pickCompleteConditions,
  startCondition,
} from './filter-conditions-ui';

export interface ConditionsEditorProps {
  /** What can be filtered on: the temperature and the business's own fields. */
  fields: readonly FilterableField[];
  /** The conditions on the list now. */
  applied: readonly FilterCondition[];
  /** Applies the finished rows to the list. */
  onApply: (conditions: FilterCondition[]) => void;
}

/** The box for a row's value, in the shape its field takes: a list for choices and yes/no, a number or date box, or plain text. */
function ValueBox({
  field,
  condition,
  onChange,
}: {
  field: FilterableField;
  condition: FilterCondition;
  onChange: (value: string) => void;
}) {
  const current = condition.value === undefined ? '' : String(condition.value);
  const label = t('leads.filter.value');
  if (field.type === 'dropdown') {
    return (
      <SelectField
        label={label}
        value={current}
        options={[
          { value: '', label: '' },
          ...field.options.map((option) => ({ value: option, label: describeChoice(field, option) })),
        ]}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (field.type === 'yes_no') {
    return (
      <SelectField
        label={label}
        value={current}
        options={[
          { value: '', label: '' },
          { value: 'yes', label: t('leads.filter.yes') },
          { value: 'no', label: t('leads.filter.no') },
        ]}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  return (
    <TextField
      label={label}
      value={current}
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
      onChange={(event) => onChange(event.target.value)}
      autoComplete="off"
    />
  );
}

/**
 * The extra conditions of the Filter panel (F11): each row is a field, a condition ("is", "is more than", "contains", "is empty") and a value that fits the
 * field. Rows are edited freely and only the finished ones are applied, when "Apply filters" is pressed, so typing never searches on every key.
 */
export function ConditionsEditor({ fields, applied, onApply }: ConditionsEditorProps) {
  const [rows, setRows] = useState<FilterCondition[]>([...applied]);
  const firstField = fields[0];

  const changeRow = (index: number, change: FilterCondition) =>
    setRows((current) => current.map((row, position) => (position === index ? change : row)));

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
      <p className="text-label-sm text-text-primary">{t('leads.filter.conditions')}</p>
      {rows.map((row, index) => {
        const field = fields.find((candidate) => candidate.field === row.field) ?? firstField;
        if (!field) return null;
        return (
          <div key={index} className="flex flex-col gap-2 rounded-md border border-border-subtle p-2">
            <SelectField
              label={t('leads.filter.field')}
              value={field.field}
              options={fields.map((candidate) => ({ value: candidate.field, label: candidate.label }))}
              onChange={(event) => {
                const picked = fields.find((candidate) => candidate.field === event.target.value);
                if (picked) changeRow(index, changeConditionField(picked));
              }}
            />
            <SelectField
              label={t('leads.filter.operator')}
              value={row.operator}
              options={listOperatorsFor(field).map((operator) => ({
                value: operator,
                label: describeOperator(operator),
              }))}
              onChange={(event) => changeRow(index, changeConditionOperator(row, event.target.value as FilterOperator))}
            />
            {operatorNeedsValue(row.operator) ? (
              <ValueBox field={field} condition={row} onChange={(value) => changeRow(index, { ...row, value })} />
            ) : null}
            <Button
              variant="tertiary"
              size="compact"
              onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
            >
              {t('leads.filter.removeCondition')}
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          size="compact"
          disabled={!firstField}
          onClick={() => firstField && setRows((current) => [...current, startCondition(firstField)])}
        >
          {t('leads.filter.addCondition')}
        </Button>
        <Button variant="primary" size="compact" onClick={() => onApply(pickCompleteConditions(rows))}>
          {t('leads.filter.applyConditions')}
        </Button>
      </div>
    </div>
  );
}
