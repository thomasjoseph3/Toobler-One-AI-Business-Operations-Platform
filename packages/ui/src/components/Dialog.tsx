import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface DialogProps {
  isOpen: boolean;
  /** Called when the person closes the dialog: the close button, the Escape key, or a press on the dimmed page. */
  onClose: () => void;
  title: string;
  closeLabel: string;
  /** The dialog's buttons, at the bottom (Cancel, then the main action). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A small box in the middle of the screen over a dimmed page, for a short question or a confirmation (design system dialog: 16 px
 * corners, a labelled title, a focus trap, Escape closes, focus returns to the button that opened it). A native `<dialog>`, so the
 * browser does the focus trap and the Escape key.
 */
export function Dialog({ isOpen, onClose, title, closeLabel, footer, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Open or close the native dialog to match `isOpen`
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A press on the dimmed page (the dialog's own backdrop) closes it; presses inside the box do not
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-xl border border-border-default bg-surface p-0 text-text-primary shadow-lg backdrop:bg-scrim"
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <h2 id={titleId} className="text-heading-md">
          {title}
        </h2>
        <IconButton label={closeLabel} icon={<X aria-hidden className="size-5" />} onClick={onClose} />
      </div>
      <div className="px-6 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 px-6 pb-5">{footer}</div> : null}
    </dialog>
  );
}
