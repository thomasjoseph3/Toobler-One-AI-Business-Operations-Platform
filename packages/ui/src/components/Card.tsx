import type { HTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** 16 px padding instead of 24 px, for dense data cards. */
  isCompact?: boolean;
}

/** The standard panel: white surface, 1 px border, 12 px corners, no shadow. Do not nest cards. */
export function Card({ isCompact = false, className, children, ...rest }: CardProps) {
  return (
    <section
      className={joinClassNames(
        'rounded-lg border border-border-default bg-surface',
        isCompact ? 'p-4' : 'p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}
