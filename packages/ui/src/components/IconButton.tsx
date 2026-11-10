import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from '../join-class-names';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** What the button does, read by screen readers and shown as a tooltip. An icon-only button must have one. */
  label: string;
  icon: ReactNode;
  size?: 'standard' | 'touch';
}

/** A square button with only an icon. The required `label` is its accessible name. */
export function IconButton({ label, icon, size = 'standard', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={joinClassNames(
        'inline-flex items-center justify-center rounded-md border border-transparent text-text-secondary',
        'hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled',
        size === 'touch' ? 'size-11' : 'size-10',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
