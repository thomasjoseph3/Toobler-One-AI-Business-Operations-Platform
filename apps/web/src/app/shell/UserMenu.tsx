import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { joinClassNames, MoreIcon } from '@toobler-one/ui';
import { useSession } from '../../auth/session';
import { t } from '../i18n';

/** Turns "Anita Nair" into "AN": the first letter of the first two words, in capitals. */
function findInitials(personName: string): string {
  return personName
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export interface UserMenuProps {
  /** `card` is the dark user card at the bottom of the sidebar; `avatar` is the small round button in the phone top bar. */
  variant: 'card' | 'avatar';
  /** In the compact sidebar the card shrinks to the avatar only. */
  isCompact?: boolean;
}

/** Shows who is signed in and opens a small menu with Sign out. Nothing is shown while nobody is signed in. */
export function UserMenu({ variant, isCompact = false }: UserMenuProps) {
  const { sessionState, signOut } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // While the menu is open: Escape or a press outside closes it (the press on the button itself is handled by the button).
  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  const avatar = (
    <span
      aria-hidden
      className="text-label-xs-semibold flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar text-sidebar-item-active"
    >
      {findInitials(user.name)}
    </span>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
        className={joinClassNames(
          variant === 'card'
            ? 'flex w-full items-center gap-3 rounded-md bg-sidebar-item-active-bg p-2 text-left'
            : 'flex size-10 items-center justify-center rounded-full bg-sidebar',
        )}
      >
        {avatar}
        {/* The button's name comes from its content: the person, the business and what the button opens. */}
        {variant === 'avatar' ? (
          <span className="sr-only">
            {user.name} {business.name}, {t('userMenu.open')}
          </span>
        ) : null}
        {variant === 'card' && !isCompact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="text-label-sm block truncate text-sidebar-item-active">{user.name}</span>
              <span className="text-label-xs block truncate text-sidebar-item">{business.name}</span>
            </span>
            <MoreIcon size={20} className="shrink-0 text-sidebar-item" />
            <span className="sr-only">{t('userMenu.open')}</span>
          </>
        ) : null}
      </button>
      {isOpen ? (
        <div
          role="menu"
          className={joinClassNames(
            'absolute z-20 min-w-48 rounded-lg border border-border-default bg-surface p-1 shadow-md',
            variant === 'card' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2',
          )}
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => void signOut()}
            className="text-body-md flex h-10 w-full items-center gap-2 rounded-md px-3 text-text-primary hover:bg-hover"
          >
            <LogOut aria-hidden className="size-4" />
            {t('session.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
