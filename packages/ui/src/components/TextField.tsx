import { useId, type InputHTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'size'> {
  /** Always visible; a placeholder is never a label. */
  label: string;
  /** Short note such as "Optional", shown next to the label. */
  requirementLabel?: string;
  helperText?: string;
  /** When set the field is in its error state and the message shows below it. */
  errorMessage?: string;
  /** `compact` is 32 px high, to sit in a toolbar beside compact buttons (proposed to the designer in docs/FRONTEND.md). */
  size?: 'standard' | 'touch' | 'compact';
  /** Hides the label from sight but keeps it for screen readers: for a toolbar search box whose placeholder says what it is for. */
  isLabelHidden?: boolean;
}

/** A labelled text input with helper text and an error message, wired up for screen readers. */
export function TextField({
  label,
  requirementLabel,
  helperText,
  errorMessage,
  size = 'standard',
  isLabelHidden = false,
  className,
  ...rest
}: TextFieldProps) {
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [errorMessage ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={joinClassNames('flex flex-col gap-1', className)}>
      <label
        htmlFor={inputId}
        className={joinClassNames('text-label-sm text-text-primary', isLabelHidden ? 'sr-only' : undefined)}
      >
        {label}
        {requirementLabel ? <span className="text-text-secondary"> ({requirementLabel})</span> : null}
      </label>
      <input
        id={inputId}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={describedBy}
        className={joinClassNames(
          'text-body-md w-full rounded-md border bg-input px-3 text-text-primary placeholder:text-text-tertiary',
          'hover:border-border-emphasis read-only:bg-surface-subtle disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-disabled',
          errorMessage ? 'border-error' : 'border-border-default',
          size === 'touch' ? 'h-11' : size === 'compact' ? 'text-body-sm h-8' : 'h-10',
        )}
        {...rest}
      />
      {errorMessage ? (
        <p id={errorId} className="text-body-xs text-error">
          {errorMessage}
        </p>
      ) : null}
      {helperText ? (
        <p id={helperId} className="text-body-xs text-text-secondary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
