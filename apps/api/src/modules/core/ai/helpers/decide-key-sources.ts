import type { AiKeyMode } from '@toobler-one/shared';

// Pure rule: given a business's key mode and what the platform has allowed it, which keys may answer? Kept apart so it can be
// tested on its own.

export interface KeySourceDecision {
  /** The business's own keys may be used. */
  useOwn: boolean;
  /** The platform's keys may be used (switched on for the business and not past the end date). */
  usePlatform: boolean;
  /** Why the platform's keys are off when the mode wanted them: never switched on, the end date has passed, or this month's cap is used up. */
  platformBlockedBecause: 'not_enabled' | 'ended' | 'cap_reached' | null;
}

/**
 * `own`: only the business's keys. `platform`: only the platform's, and only while the platform has switched them on for the
 * business, the end date (if any) has not passed and this month's cap (if any) is not used up. `own_then_platform`: both (own first), the platform's under the same conditions.
 */
export function decideKeySources(options: {
  keyMode: AiKeyMode;
  platformEnabled: boolean;
  platformExpiresAt: Date | null;
  /** Calls a month allowed on the platform's keys, or null for no cap. */
  platformMonthlyCallCap: number | null;
  /** Answered calls this month on the platform's keys. */
  platformCallsThisMonth: number;
  now: Date;
}): KeySourceDecision {
  const wantsOwn = options.keyMode === 'own' || options.keyMode === 'own_then_platform';
  const wantsPlatform = options.keyMode === 'platform' || options.keyMode === 'own_then_platform';
  const ended = options.platformExpiresAt !== null && options.platformExpiresAt.getTime() <= options.now.getTime();
  const capReached =
    options.platformMonthlyCallCap !== null && options.platformCallsThisMonth >= options.platformMonthlyCallCap;
  const platformBlockedBecause = !wantsPlatform
    ? null
    : !options.platformEnabled
      ? 'not_enabled'
      : ended
        ? 'ended'
        : capReached
          ? 'cap_reached'
          : null;
  return {
    useOwn: wantsOwn,
    usePlatform: wantsPlatform && platformBlockedBecause === null,
    platformBlockedBecause,
  };
}
