import { useId, type TextareaHTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  /** Always visible; a placeholder is never a label. */
  label: string;
  /** Short note such as "Optional", shown next to the label. */
  requirementLabel?: string;
  helperText?: string;
  /** When set the field is in its error state and the message shows below it. */
  errorMessage?: string;
}

/** A labelled box for longer text, with helper text and an error message, wired up for screen readers (the multi-line twin of TextField). */
export function TextAreaField({
  label,
  requirementLabel,
  helperText,
  errorMessage,
  className,
  rows = 3,
  ...rest
}: TextAreaFieldProps) {
  const fieldId = useId();
  const helperId = `${fieldId}-helper`;
  const errorId = `${fieldId}-error`;
  const describedBy =
    [errorMessage ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={joinClassNames('flex flex-col gap-1', className)}>
      <label htmlFor={fieldId} className="text-label-sm text-text-primary">
        {label}
        {requirementLabel ? <span className="text-text-secondary"> ({requirementLabel})</span> : null}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={describedBy}
        className={joinClassNames(
          'text-body-md w-full rounded-md border bg-input px-3 py-2 text-text-primary placeholder:text-text-tertiary',
          'hover:border-border-emphasis disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-disabled',
          errorMessage ? 'border-error' : 'border-border-default',
        )}
        {...rest}
      />
      {helperText ? (
        <p id={helperId} className="text-body-xs text-text-secondary">
          {helperText}
        </p>
      ) : null}
      {errorMessage ? (
        <p id={errorId} className="text-body-xs text-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
