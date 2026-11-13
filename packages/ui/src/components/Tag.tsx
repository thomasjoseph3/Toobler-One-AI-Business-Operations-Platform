import type { ReactNode } from 'react';
import { joinClassNames } from '../join-class-names';

/**
 * The colours of the lead-stage tags, named as in the Figma frame. A tag's colour is only a hint: its word always shows.
 * Stage names are the business's own, so the screen that uses a Tag chooses the tone (for example from the stage's kind
 * and position), never from the stage's name.
 */
export type TagTone = 'new' | 'contacted' | 'qualified' | 'rate-sent' | 'won' | 'lost' | 'neutral';

export interface TagProps {
  tone: TagTone;
  /** The word shown, exactly as the backend sends it. */
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<TagTone, string> = {
  new: 'bg-tag-stage-new text-link-hover',
  contacted: 'bg-tag-stage-contacted text-text-secondary',
  qualified: 'bg-tag-stage-qualified text-text-secondary',
  'rate-sent': 'bg-tag-stage-rate-sent text-text-secondary',
  won: 'bg-tag-stage-won text-link-hover',
  lost: 'bg-tag-stage-lost text-link-hover',
  /** For stages the designer gave no tone to (a business can add more stages than the frame shows). */
  neutral: 'bg-hover text-text-secondary',
};

/** A small square-cornered pill with a stage word on a tinted background (Figma "Tag / stage"). Badge is for counts and statuses. */
export function Tag({ tone, children, className }: TagProps) {
  return (
    <span
      className={joinClassNames(
        'text-label-xs inline-flex items-center rounded-sm px-2 py-1 whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
