import { Button } from './Button';

export interface PaginationProps {
  /** The sentence on the left, for example "Showing 5 of 28 open leads". */
  summary: string;
  /** The words for the two buttons, so the screen keeps them in its own text file. */
  previousLabel: string;
  nextLabel: string;
  /** What the pair of buttons is for, read by screen readers ("Leads pages"). */
  ariaLabel: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/** The footer of a list (Figma "Pagination"): what is shown on the left, Previous and Next on the right. */
export function Pagination({
  summary,
  previousLabel,
  nextLabel,
  ariaLabel,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: PaginationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface-subtle px-4 py-3"
    >
      <p className="text-body-xs text-text-secondary">{summary}</p>
      <div className="flex gap-2">
        <Button size="compact" disabled={!hasPrevious} onClick={onPrevious}>
          {previousLabel}
        </Button>
        <Button size="compact" disabled={!hasNext} onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
