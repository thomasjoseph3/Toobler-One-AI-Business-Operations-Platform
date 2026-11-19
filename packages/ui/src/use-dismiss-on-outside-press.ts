import { useEffect, type RefObject } from 'react';

/**
 * While `isOpen` is true, calls `onDismiss` when the Escape key is pressed or when a press lands outside `containerRef`.
 * Used by every small panel that opens under a button (the filter panel, the row menu, the account menu), so the rule is written once.
 */
export function useDismissOnOutsidePress(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;
    const dismissOnOutsidePress = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onDismiss();
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('pointerdown', dismissOnOutsidePress);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOnOutsidePress);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [containerRef, isOpen, onDismiss]);
}
