import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { joinClassNames } from '../join-class-names';
import { buttonClasses, type ButtonVariant } from './Button';

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: 'standard' | 'touch' | 'compact';
  /** An icon shown before the label. */
  leadingIcon?: ReactNode;
}

/**
 * A link drawn exactly like a Button, for addresses that open another app or page: `tel:` (the dialler), `https://wa.me/...`
 * (WhatsApp), `mailto:` (the mail app). A real `<a>`, so it opens correctly and a screen reader says "link".
 */
export function ButtonLink({
  variant = 'secondary',
  size = 'standard',
  leadingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a className={joinClassNames(buttonClasses(variant, size), className)} {...rest}>
      {leadingIcon}
      {children}
    </a>
  );
}
