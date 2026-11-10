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
  size?: 'standard' | 'touch';
}

/** A labelled text input with helper text and an error message, wired up for screen readers. */
export function TextField({
  label,
  requirementLabel,
  helperText,
  errorMessage,
  size = 'standard',
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
      <label htmlFor={inputId} className="text-xs-label text-text-primary">
        {label}
        {requirementLabel ? <span className="text-text-secondary"> ({requirementLabel})</span> : null}
      </label>
      <input
        id={inputId}
        aria-invalid={errorMessage ? true : undefined}
        aria-describedby={describedBy}
        className={joinClassNames(
          'text-sm-body w-full rounded-md border bg-surface px-3 text-text-primary placeholder:text-text-muted',
          'hover:border-text-muted read-only:bg-surface-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled',
          errorMessage ? 'border-error' : 'border-border-strong',
          size === 'touch' ? 'h-11' : 'h-10',
        )}
        {...rest}
      />
      {errorMessage ? (
        <p id={errorId} className="text-xs-caption text-error">
          {errorMessage}
        </p>
      ) : null}
      {helperText ? (
        <p id={helperId} className="text-xs-caption text-text-secondary">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
