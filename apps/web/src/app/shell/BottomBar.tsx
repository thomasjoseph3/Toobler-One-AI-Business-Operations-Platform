import { useEffect, useRef, useState } from 'react';
import { Ellipsis, X } from 'lucide-react';
import { NavLink } from 'react-router';
import { IconButton, joinClassNames } from '@toobler-one/ui';
import { t } from '../i18n';
import { NAVIGATION_ITEMS } from '../navigation';

const barLinkClasses = (isActive: boolean) =>
  joinClassNames(
    'text-label-xs flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1',
    isActive ? 'text-text-primary' : 'text-text-secondary',
  );

/**
 * The phone navigation: a bottom bar with the four most-used pages and "More", which opens a sheet with all the other
 * pages. Touch targets are 64 px high. Hidden from 768 px up, where the sidebar takes over.
 */
export function BottomBar() {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);

  // The sheet is a native <dialog>: the browser traps focus inside it and closes it on Escape.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (isMoreOpen && !sheet.open) sheet.showModal();
    if (!isMoreOpen && sheet.open) sheet.close();
  }, [isMoreOpen]);

  const barItems = NAVIGATION_ITEMS.filter((item) => item.isInBottomBar);
  const moreItems = NAVIGATION_ITEMS.filter((item) => !item.isInBottomBar);

  return (
    <>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-border-default bg-surface md:hidden"
      >
        {barItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => barLinkClasses(isActive)}
          >
            <item.icon aria-hidden className="size-5" />
            {t(item.labelKey)}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          aria-haspopup="dialog"
          className={barLinkClasses(false)}
        >
          <Ellipsis aria-hidden className="size-5" />
          {t('nav.more')}
        </button>
      </nav>

      <dialog
        ref={sheetRef}
        aria-label={t('nav.moreTitle')}
        onClose={() => setIsMoreOpen(false)}
        className="m-0 mt-auto w-full max-w-none rounded-t-xl border border-border-default bg-surface p-4 text-text-primary backdrop:bg-scrim"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-heading-sm">{t('nav.moreTitle')}</h2>
          <IconButton
            label={t('nav.close')}
            icon={<X aria-hidden className="size-5" />}
            size="touch"
            onClick={() => setIsMoreOpen(false)}
          />
        </div>
        <ul className="flex flex-col">
          {moreItems.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) =>
                  joinClassNames(
                    'text-body-md flex h-12 items-center gap-3 rounded-md px-2',
                    isActive ? 'bg-selected text-text-primary' : 'text-text-primary hover:bg-hover',
                  )
                }
              >
                <item.icon aria-hidden className="size-5" />
                {t(item.labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
