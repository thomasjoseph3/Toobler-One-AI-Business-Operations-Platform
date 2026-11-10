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
  neutral: 'bg-surface-muted text-text-secondary border-border',
  success: 'bg-success-bg text-success border-success-border',
  warning: 'bg-warning-bg text-warning border-warning-border',
  error: 'bg-error-bg text-error border-error-border',
  info: 'bg-info-bg text-info border-info-border',
};

/** A small tinted pill with readable text and an optional icon, used for every status. */
export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={joinClassNames(
        'text-xs-label inline-flex items-center gap-1 rounded-full border px-2 py-0.5 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
