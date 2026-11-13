import { useCallback, useEffect, useRef, useState } from 'react';
import { joinClassNames } from '../join-class-names';
import { MoreIcon } from '../icons';
import { IconButton } from './IconButton';
import { useDismissOnOutsidePress } from '../use-dismiss-on-outside-press';

/** How much room the list needs below the button (in pixels) before it opens downward; less than that and it opens upward. */
const MENU_ROOM_NEEDED = 320;

export interface ActionMenuItem {
  /** Unique within the menu. */
  id: string;
  label: string;
  onSelect: () => void;
  /** `danger` is for an action that removes something; it is drawn in the error colour and always has a clear verb. */
  tone?: 'default' | 'danger';
  /** Items with the same group sit together under that group's heading (if it has one). */
  group?: string;
}

export interface ActionMenuProps {
  /** The name of the "…" button, for screen readers ("More actions for Priya Menon"). */
  triggerLabel: string;
  /** What the opened list is for. */
  panelLabel: string;
  items: readonly ActionMenuItem[];
  /** The heading to show above each group of items, by group name. A group without a heading shows none. */
  groupHeadings?: Record<string, string>;
}

/**
 * The "…" menu on a row (Figma "more"): a button that opens a short list of actions under it. The list closes on Escape, on a press
 * outside it, and after an action is chosen. The actions are plain buttons in the normal Tab order.
 */
export function ActionMenu({ triggerLabel, panelLabel, items, groupHeadings = {} }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Where the list is drawn on the screen: fixed to the window (so a scrolling table cannot cut it off), under the button, or above it near the bottom
  const [panelPlace, setPanelPlace] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismissOnOutsidePress(containerRef, isOpen, close);

  // Scrolling anything while the list is open closes it, because the button it belongs to moves away from it
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  // Opens or closes the list. On opening, works out from the button's place on the screen where to draw it.
  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const buttonPlace = containerRef.current?.getBoundingClientRect();
    if (buttonPlace) {
      const roomBelow = window.innerHeight - buttonPlace.bottom;
      const right = window.innerWidth - buttonPlace.right;
      // A list taller than the room below the button opens upward instead
      setPanelPlace(
        roomBelow < MENU_ROOM_NEEDED
          ? { right, bottom: window.innerHeight - buttonPlace.top + 4 }
          : { right, top: buttonPlace.bottom + 4 },
      );
    }
    setIsOpen(true);
  };

  // Items in their groups, keeping the order they came in
  const groupNames = [...new Set(items.map((item) => item.group ?? ''))];

  return (
    <div ref={containerRef} className="relative inline-block">
      <IconButton
        label={triggerLabel}
        size="compact"
        icon={<MoreIcon size={20} />}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={toggle}
      />
      {isOpen && panelPlace ? (
        <div
          role="group"
          aria-label={panelLabel}
          style={panelPlace}
          className="fixed z-30 flex max-h-[min(24rem,calc(100vh-32px))] min-w-52 flex-col gap-1 overflow-y-auto rounded-lg border border-border-default bg-surface p-1 shadow-md"
        >
          {groupNames.map((groupName, groupPosition) => (
            <div
              key={groupName}
              className={joinClassNames('flex flex-col', groupPosition > 0 ? 'border-t border-border-subtle pt-1' : '')}
            >
              {groupHeadings[groupName] ? (
                <p className="text-label-xs-caps px-3 py-1 text-text-tertiary">{groupHeadings[groupName]}</p>
              ) : null}
              {items
                .filter((item) => (item.group ?? '') === groupName)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      item.onSelect();
                    }}
                    className={joinClassNames(
                      'text-body-md flex h-9 w-full items-center rounded-md px-3 text-left hover:bg-hover',
                      item.tone === 'danger' ? 'text-error' : 'text-text-primary',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
