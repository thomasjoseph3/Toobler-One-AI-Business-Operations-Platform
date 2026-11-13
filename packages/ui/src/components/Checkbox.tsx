import { useId, type InputHTMLAttributes } from 'react';
import { CheckIcon } from '../icons';
import { joinClassNames } from '../join-class-names';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'size'> {
  /** What the checkbox is for. It is the accessible name, and it is shown unless `isLabelHidden` is set. */
  label: string;
  /** Hide the words but keep them for screen readers, for example a "select this row" box in a table. */
  isLabelHidden?: boolean;
}

/** A 16 px checkbox (Figma "Checkbox"): a real input, so keyboard and screen readers work, drawn with the design tokens. */
export function Checkbox({ label, isLabelHidden = false, className, ...rest }: CheckboxProps) {
  const inputId = useId();
  return (
    <span className={joinClassNames('inline-flex items-center gap-2', className)}>
      <span className="relative inline-flex size-4 shrink-0">
        <input
          id={inputId}
          type="checkbox"
          className="peer size-4 cursor-pointer appearance-none rounded-sm border-[1.3px] border-border-emphasis bg-input checked:border-icon-strong checked:bg-action disabled:cursor-not-allowed disabled:border-border-default disabled:bg-disabled"
          {...rest}
        />
        <CheckIcon className="pointer-events-none absolute inset-0 m-auto hidden text-action-text peer-checked:block" />
      </span>
      <label htmlFor={inputId} className={isLabelHidden ? 'sr-only' : 'text-body-md text-text-primary'}>
        {label}
      </label>
    </span>
  );
}
