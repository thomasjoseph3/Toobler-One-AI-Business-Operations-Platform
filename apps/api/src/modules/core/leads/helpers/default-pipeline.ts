import type { StageKind } from '@toobler-one/shared';

// What every new business starts with. Pure data, no database: the sign-up setup and the tests both read it.
// Industries will change these words (a hotel says "Called" and "Rate sent") through presets, never through different code.

/** The columns of the leads board, left to right. Won and Lost are always the last two. */
export const DEFAULT_STAGES: ReadonlyArray<{ name: string; kind: StageKind }> = [
  { name: 'New', kind: 'open' },
  { name: 'Contacted', kind: 'open' },
  { name: 'Quoted', kind: 'open' },
  { name: 'Won', kind: 'won' },
  { name: 'Lost', kind: 'lost' },
];

/** The reasons the Lost dialog offers until the manager changes the list. */
export const DEFAULT_LOST_REASONS: readonly string[] = [
  'Too costly',
  'Went elsewhere',
  'Dates not available',
  'No reply',
  'Other',
];

/** The name of a new business's one pipeline. */
export const DEFAULT_PIPELINE_NAME = 'Sales pipeline';

/** The most open stages (not counting Won and Lost) a business can have, so the board stays readable on a phone. */
export const MAX_OPEN_STAGES = 12;
