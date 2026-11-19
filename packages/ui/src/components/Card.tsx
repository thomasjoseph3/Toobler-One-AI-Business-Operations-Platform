import type { HTMLAttributes } from 'react';
import { joinClassNames } from '../join-class-names';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** 16 px padding instead of 24 px, for dense data cards. */
  isCompact?: boolean;
  /** No padding and clipped corners, for a table or list that runs edge to edge inside the card. */
  isFlush?: boolean;
}

/** The standard panel: white surface, 1 px border, 12 px corners, no shadow. Do not nest cards. */
export function Card({ isCompact = false, isFlush = false, className, children, ...rest }: CardProps) {
  return (
    <section
      className={joinClassNames(
        'rounded-lg border border-border-default bg-surface',
        isFlush ? 'overflow-hidden' : isCompact ? 'p-4' : 'p-6',
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}
