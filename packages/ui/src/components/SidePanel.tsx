import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface SidePanelProps {
  isOpen: boolean;
  /** Called when the person closes the panel: the close button, the Escape key, or a press on the dimmed page. */
  onClose: () => void;
  title: string;
  /** The words for the close button. */
  closeLabel: string;
  /** The panel's buttons (Cancel, Save), kept in view at the bottom while the form scrolls. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A panel that slides in from the right over the page, for a form (the design system's dialog rules: a labelled title, a
 * focus trap, Escape closes, focus returns to the button that opened it). On a phone it fills the screen. It is a native
 * `<dialog>`, so the browser does the focus trap and the Escape key.
 */
export function SidePanel({ isOpen, onClose, title, closeLabel, footer, children }: SidePanelProps) {
  const panelRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open or close the native dialog to match `isOpen`
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (isOpen && !panel.open) panel.showModal();
    if (!isOpen && panel.open) panel.close();
  }, [isOpen]);

  return (
    <dialog
      ref={panelRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A press on the dimmed page (the dialog's own backdrop) closes it; presses inside the panel's content do not
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-scrim"
    >
      <div className="ml-auto flex h-full w-full flex-col bg-surface text-text-primary shadow-lg md:w-[480px] md:rounded-l-xl md:border-l md:border-border-default">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 md:px-6">
          <h2 id={titleId} className="text-heading-lg">
            {title}
          </h2>
          <IconButton label={closeLabel} icon={<X aria-hidden className="size-5" />} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">{children}</div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-4 py-3 md:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
