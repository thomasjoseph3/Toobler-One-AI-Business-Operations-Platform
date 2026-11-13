import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { joinClassNames } from '../join-class-names';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'link';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Primary is for the one main action of an area; the others support it (design system 3.1). */
  variant?: ButtonVariant;
  /** `touch` is 44 px high, for phone layouts. `standard` is 40 px. */
  size?: 'standard' | 'touch';
  /** Shows a spinner, keeps the label, and ignores clicks while something is happening. */
  isLoading?: boolean;
  /** An icon shown before the label. */
  leadingIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-action text-action-text hover:bg-action-hover active:bg-action-pressed border border-transparent',
  secondary: 'bg-surface text-text-primary border border-border-default hover:bg-hover',
  tertiary: 'bg-transparent text-text-primary border border-transparent hover:bg-hover',
  destructive: 'bg-error-bg text-error border border-transparent hover:border-error',
  link: 'bg-transparent text-link hover:text-link-hover border border-transparent hover:underline underline-offset-2 !h-auto !px-0',
};

/** A button with the design system's five variants and its default, hover, focus, pressed, disabled and loading states. */
export function Button({
  variant = 'secondary',
  size = 'standard',
  isLoading = false,
  leadingIcon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={joinClassNames(
        'text-body-md-semibold inline-flex items-center justify-center gap-2 rounded-md px-4',
        size === 'touch' ? 'h-11' : 'h-10',
        VARIANT_CLASSES[variant],
        'disabled:cursor-not-allowed disabled:border-border-default disabled:bg-surface-subtle disabled:text-text-disabled',
        className,
      )}
      {...rest}
    >
      {isLoading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : leadingIcon}
      {children}
    </button>
  );
}
