import type { ReactNode } from 'react';
import { joinClassNames } from '../join-class-names';

export interface SegmentedControlOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
  /** False for a choice that is drawn but does not work yet: it cannot be picked and says so to screen readers. */
  isAvailable?: boolean;
}

export interface SegmentedControlProps<Value extends string> {
  options: readonly SegmentedControlOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  /** What the choice is about, read by screen readers ("Leads view"). */
  ariaLabel: string;
}

/** A small switch between a few views (Figma "List | Split view"): the chosen one sits on a white tile. */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<Value>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-md border border-border-subtle bg-surface-subtle p-0.5"
    >
      {options.map((option) => {
        const isChosen = option.value === value;
        const isAvailable = option.isAvailable !== false;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isChosen}
            aria-disabled={isAvailable ? undefined : true}
            onClick={() => {
              if (isAvailable) onChange(option.value);
            }}
            className={joinClassNames(
              'text-label-sm inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5',
              isChosen ? 'bg-surface text-text-primary shadow-sm' : 'text-text-tertiary',
              isAvailable ? '' : 'cursor-not-allowed',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
