import { useId, type SelectHTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'size' | 'children'> {
  /** Always visible; it is the field's name for everyone, screen readers included. */
  label: string;
  options: readonly { value: string; label: string }[];
}

/** A labelled drop-down list (a native `<select>`, so the keyboard, the phone's own picker and screen readers all work), styled like the text fields. */
export function SelectField({ label, options, className, ...rest }: SelectFieldProps) {
  const selectId = useId();
  return (
    <div className={joinClassNames('flex flex-col gap-1', className)}>
      <label htmlFor={selectId} className="text-label-sm text-text-primary">
        {label}
      </label>
      <select
        id={selectId}
        className="text-body-md h-10 w-full rounded-md border border-border-default bg-input px-3 text-text-primary hover:border-border-emphasis"
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
