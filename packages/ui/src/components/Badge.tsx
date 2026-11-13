import type { ReactNode } from 'react';
import { joinClassNames } from '../join-class-names';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Optional small icon. State must never be shown by colour alone, so a badge always has text. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-subtle text-text-secondary',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
  info: 'bg-info-bg text-info',
};

/** A small tinted pill with readable text and an optional icon, used for every status. */
export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={joinClassNames(
        'text-label-sm inline-flex items-center gap-1 rounded-full px-2 py-1 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
