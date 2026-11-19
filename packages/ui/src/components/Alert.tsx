import type { ReactNode } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { joinClassNames } from '../join-class-names';

export interface AlertProps {
  tone: 'error' | 'success';
  children: ReactNode;
  /** A button such as "Dismiss", shown at the end of the message. */
  action?: ReactNode;
  className?: string;
}

/**
 * A short message with an icon and words, never colour alone (design system: errors and confirmations). An error is announced
 * at once (`role="alert"`); a success is announced politely (`role="status"`). The icons are Lucide, as the Figma frame has none for this.
 */
export function Alert({ tone, children, action, className }: AlertProps) {
  const Icon = tone === 'error' ? TriangleAlert : CircleCheck;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={joinClassNames(
        'text-body-md flex items-start gap-2 rounded-md p-3',
        tone === 'error' ? 'bg-error-bg text-error' : 'bg-success-bg text-success',
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
