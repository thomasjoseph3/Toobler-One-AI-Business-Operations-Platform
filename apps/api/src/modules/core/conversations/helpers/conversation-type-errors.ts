import { MAX_ACTIVE_CONVERSATION_TYPES } from '@toobler-one/shared';
import { conflict } from '../../../../kernel/errors';

// The database error code for "a check failed", which the active-types rule (migration 032) uses when a business would go over 25.
const CHECK_VIOLATION = '23514';

/** True when the error is the database refusing a 26th active type (two requests at the same moment can get past the friendly check). */
export const isTooManyActiveTypesError = (error: unknown) =>
  error instanceof Error &&
  'code' in error &&
  error.code === CHECK_VIOLATION &&
  error.message.includes('too_many_active_conversation_types');

/** The 409 answer for a business that already has the most active types. */
export const tooManyTypesError = () =>
  conflict(
    'TOO_MANY_TYPES',
    `A business can have up to ${MAX_ACTIVE_CONVERSATION_TYPES} active conversation types. Switch one off or remove one first.`,
  );
