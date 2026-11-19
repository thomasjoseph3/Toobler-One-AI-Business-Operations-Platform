import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { joinClassNames, MoreIcon, useDismissOnOutsidePress } from '@toobler-one/ui';
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
  // Where the menu is drawn on the screen: fixed to the window, so the sidebar's own scroll box cannot cut it off
  const [menuPlace, setMenuPlace] = useState<{ left?: number; right?: number; top?: number; bottom?: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  useDismissOnOutsidePress(containerRef, isOpen, close);

  // Scrolling or resizing while the menu is open closes it, because the button it belongs to moves away
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  // Opens or closes the menu. On opening it works out from the button's place where to draw it: above the card, beside the
  // narrow collapsed card, or under the avatar in the phone's top bar.
  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const buttonPlace = containerRef.current?.getBoundingClientRect();
    if (buttonPlace) {
      if (variant === 'avatar') {
        setMenuPlace({ right: window.innerWidth - buttonPlace.right, top: buttonPlace.bottom + 8 });
      } else if (isCompact) {
        // Beside the collapsed sidebar, clear of its edge (not just clear of the small card)
        const sidebarRight = containerRef.current?.closest('nav')?.getBoundingClientRect().right ?? buttonPlace.right;
        setMenuPlace({ left: sidebarRight + 8, bottom: window.innerHeight - buttonPlace.bottom });
      } else {
        setMenuPlace({ left: buttonPlace.left, bottom: window.innerHeight - buttonPlace.top + 8 });
      }
    }
    setIsOpen(true);
  };

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
        onClick={toggle}
        className={joinClassNames(
          variant === 'card'
            ? joinClassNames(
                'flex items-center rounded-lg bg-sidebar-item-active-bg text-left',
                isCompact ? 'p-1' : 'w-full gap-3 rounded-md p-2',
              )
            : 'flex size-10 items-center justify-center rounded-full bg-sidebar',
        )}
      >
        {avatar}
        {/* The button's name comes from its content: the person, the business and what the button opens. */}
        {variant === 'avatar' || isCompact ? (
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
      {isOpen && menuPlace ? (
        <div
          role="menu"
          style={menuPlace}
          className="fixed z-30 min-w-48 rounded-lg border border-border-default bg-surface p-1 shadow-md"
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
