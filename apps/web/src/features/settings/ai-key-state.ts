import type {
  AddAiKeyRequest,
  AiKey,
  AiKeyStatus,
  AiKeyTestOutcome,
  AiPlatformAccess,
  AiPlatformUsage,
  AiProvider,
} from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

// What the AI settings page needs to decide about keys, the key mode and usage. Pure: no screen, no network.
// A key itself is never kept here after it is sent: only its preview ever comes back from the API.

export const AI_PROVIDERS: readonly AiProvider[] = ['gemini', 'openai', 'anthropic'];

export const PROVIDER_WORDS: Readonly<Record<AiProvider, MessageKey>> = {
  gemini: 'settings.ai.provider.gemini',
  openai: 'settings.ai.provider.openai',
  anthropic: 'settings.ai.provider.anthropic',
};

export interface KeyFormFields {
  provider: AiProvider;
  label: string;
  key: string;
}

export type KeyFormProblems = Partial<Record<keyof KeyFormFields, string>>;

export const EMPTY_KEY_FORM: KeyFormFields = { provider: 'gemini', label: '', key: '' };

/** Checks the form the way the API will: a label, and a key of one word, 16 to 400 characters. */
export function checkKeyForm(fields: KeyFormFields): KeyFormProblems {
  const problems: KeyFormProblems = {};
  const label = fields.label.replace(/\s+/g, ' ').trim();
  if (label === '') problems.label = 'Give the key a name you will recognise, like Main Gemini key.';
  else if (label.length > 80) problems.label = 'Keep the name under 80 characters.';
  const key = fields.key.trim();
  if (key === '') problems.key = 'Paste the key from your AI company.';
  else if (/\s/.test(key)) problems.key = 'A key is one word with no spaces. Check you copied just the key.';
  else if (key.length < 16) problems.key = 'That looks too short to be a key.';
  else if (key.length > 400) problems.key = 'That looks too long to be a key.';
  return problems;
}

export const buildAddKeyRequest = (fields: KeyFormFields): AddAiKeyRequest => ({
  provider: fields.provider,
  label: fields.label.replace(/\s+/g, ' ').trim(),
  key: fields.key.trim(),
});

/** What a key's state is called, and how it is drawn. */
export function describeKeyStatus(status: AiKeyStatus): { words: MessageKey; tone: 'neutral' | 'success' | 'warning' | 'error' } {
  switch (status) {
    case 'working':
      return { words: 'settings.ai.status.working', tone: 'success' };
    case 'limited':
      return { words: 'settings.ai.status.limited', tone: 'warning' };
    case 'failed':
      return { words: 'settings.ai.status.failed', tone: 'error' };
    default:
      return { words: 'settings.ai.status.unchecked', tone: 'neutral' };
  }
}

/** What a test of a key found, in words, and whether it counts as good news. */
export function describeTestOutcome(outcome: AiKeyTestOutcome): { words: MessageKey; isGood: boolean } {
  switch (outcome) {
    case 'works':
      return { words: 'settings.ai.test.works', isGood: true };
    case 'rejected':
      return { words: 'settings.ai.test.rejected', isGood: false };
    case 'quota':
      return { words: 'settings.ai.test.quota', isGood: false };
    case 'no_model':
      return { words: 'settings.ai.test.noModel', isGood: false };
    default:
      return { words: 'settings.ai.test.unreachable', isGood: false };
  }
}

/** The keys grouped by AI company, in a fixed order, leaving out companies with none. */
export function groupKeysByProvider(keys: readonly AiKey[]): Array<{ provider: AiProvider; keys: AiKey[] }> {
  return AI_PROVIDERS.map((provider) => ({ provider, keys: keys.filter((key) => key.provider === provider) })).filter((group) => group.keys.length > 0);
}

/**
 * Which keys will answer for the business, as one line of words. The rule is fixed (own keys first, then the platform's if the
 * platform team has switched them on), so nothing is asked: this only says what is in use, or that nothing is.
 */
export function describeWhichKeysAnswer(access: AiPlatformAccess, ownKeyCount: number): MessageKey {
  if (ownKeyCount > 0 && access.enabled) return 'settings.ai.status.ownThenPlatform';
  if (ownKeyCount > 0) return 'settings.ai.status.ownOnly';
  if (access.enabled) return 'settings.ai.status.platformOnly';
  return 'settings.ai.status.nothing';
}

/** The platform's part for the manager: whether it is allowed, the call and token allowances, what was used this month and when it ends. */
export function describePlatformUsage(usage: AiPlatformUsage): Array<{ key: MessageKey; values: Record<string, string | number> }> {
  if (!usage.enabled) return [{ key: 'settings.ai.platform.off', values: {} }];
  const lines: Array<{ key: MessageKey; values: Record<string, string | number> }> = [];
  if (usage.monthlyCallCap !== null) {
    lines.push({ key: 'settings.ai.platform.cap', values: { used: usage.usedThisMonth, cap: usage.monthlyCallCap, left: usage.remainingThisMonth ?? 0 } });
  }
  if (usage.monthlyTokenCap !== null) {
    lines.push({ key: 'settings.ai.platform.tokenCap', values: { used: usage.tokensUsedThisMonth, cap: usage.monthlyTokenCap, left: usage.tokensRemainingThisMonth ?? 0 } });
  }
  // With no limit of either kind, say so
  if (usage.monthlyCallCap === null && usage.monthlyTokenCap === null) {
    lines.push({ key: 'settings.ai.platform.noCap', values: { used: usage.usedThisMonth } });
  }
  if (usage.expiresAt) lines.push({ key: 'settings.ai.platform.expires', values: { date: usage.expiresAt } });
  return lines;
}

/** How much of the platform's monthly allowance is used, as a whole percent: the more used of the calls and the tokens (0 when there is no cap). */
export function percentOfCapUsed(
  usage: Pick<AiPlatformUsage, 'monthlyCallCap' | 'usedThisMonth' | 'monthlyTokenCap' | 'tokensUsedThisMonth'>,
): number {
  const percentOf = (used: number, cap: number | null): number =>
    cap === null || cap === 0 ? 0 : Math.min(100, Math.round((used / cap) * 100));
  return Math.max(percentOf(usage.usedThisMonth, usage.monthlyCallCap), percentOf(usage.tokensUsedThisMonth, usage.monthlyTokenCap));
}
