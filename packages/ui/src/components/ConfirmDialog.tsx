import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  isOpen: boolean;
  /** The question, naming the thing ("Delete Priya Menon's lead?"). */
  title: string;
  /** What will happen, in plain words. */
  description: string;
  /** The verb on the main button, repeating the action ("Delete lead"). */
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** `danger` draws the main button as a destructive action. */
  tone?: 'default' | 'danger';
  /** True while the action is being carried out: the button shows it is busy and cannot be pressed again. */
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The "Are you sure?" box every delete goes through: it names the thing, says what will happen, and the danger button repeats the verb. */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  tone = 'default',
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      closeLabel={closeLabel}
      footer={
        <>
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'destructive' : 'primary'} isLoading={isConfirming} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-body-md text-text-secondary">{description}</p>
    </Dialog>
  );
}
