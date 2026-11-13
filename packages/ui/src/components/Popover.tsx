import { useEffect, useRef, useState, type ReactNode } from 'react';
import { joinClassNames } from '../join-class-names';

export interface PopoverTriggerControl {
  isOpen: boolean;
  toggle: () => void;
}

export interface PopoverProps {
  /** Draws the button that opens the panel. Give the button `aria-expanded={isOpen}` and `onClick={toggle}`. */
  renderTrigger: (control: PopoverTriggerControl) => ReactNode;
  /** What the panel is for, read by screen readers ("Filter leads"). */
  panelLabel: string;
  /** Which edge of the button the panel lines up with. */
  align?: 'left' | 'right';
  children: ReactNode;
}

/**
 * A small panel that opens under a button (Filter, Sort). It closes on Escape or a press outside it. It is not modal: the
 * rest of the page stays usable, and Tab moves on into the panel's controls in the normal order.
 */
export function Popover({ renderTrigger, panelLabel, align = 'left', children }: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // While the panel is open: Escape or a press outside closes it
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

  return (
    <div ref={containerRef} className="relative">
      {renderTrigger({ isOpen, toggle: () => setIsOpen((wasOpen) => !wasOpen) })}
      {isOpen ? (
        <div
          role="dialog"
          aria-label={panelLabel}
          className={joinClassNames(
            'absolute top-full z-20 mt-2 flex w-72 max-w-[calc(100vw-32px)] flex-col gap-4 rounded-lg border border-border-default bg-surface p-4 shadow-md',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
