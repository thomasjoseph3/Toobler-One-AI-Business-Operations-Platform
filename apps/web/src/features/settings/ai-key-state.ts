import type {
  AddAiKeyRequest,
  AiKey,
  AiKeyMode,
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

/** The words for each way of choosing which keys the AI uses, and what it means. */
export const KEY_MODES: ReadonlyArray<{ mode: AiKeyMode; labelKey: MessageKey; helpKey: MessageKey }> = [
  { mode: 'own_then_platform', labelKey: 'settings.ai.mode.ownThenPlatform', helpKey: 'settings.ai.mode.ownThenPlatformHelp' },
  { mode: 'own', labelKey: 'settings.ai.mode.own', helpKey: 'settings.ai.mode.ownHelp' },
  { mode: 'platform', labelKey: 'settings.ai.mode.platform', helpKey: 'settings.ai.mode.platformHelp' },
];

/**
 * Whether the business can use a mode at all: a mode that needs the platform's keys needs the platform to have allowed them, and a mode that
 * needs its own keys needs at least one saved. The page warns instead of blocking, because the API lets the manager choose either way.
 */
export function describeModeWarning(mode: AiKeyMode, access: AiPlatformAccess, ownKeyCount: number): MessageKey | null {
  if (mode === 'own' && ownKeyCount === 0) return 'settings.ai.warn.noOwnKeys';
  if (mode === 'platform' && !access.enabled) return 'settings.ai.warn.platformOff';
  if (mode === 'own_then_platform' && ownKeyCount === 0 && !access.enabled) return 'settings.ai.warn.nothingToUse';
  return null;
}

/** The platform's part for the manager: whether it is allowed, the cap, what was used this month and when it ends. */
export function describePlatformUsage(usage: AiPlatformUsage): Array<{ key: MessageKey; values: Record<string, string | number> }> {
  if (!usage.enabled) return [{ key: 'settings.ai.platform.off', values: {} }];
  const lines: Array<{ key: MessageKey; values: Record<string, string | number> }> = [];
  lines.push(
    usage.monthlyCallCap === null
      ? { key: 'settings.ai.platform.noCap', values: { used: usage.usedThisMonth } }
      : { key: 'settings.ai.platform.cap', values: { used: usage.usedThisMonth, cap: usage.monthlyCallCap, left: usage.remainingThisMonth ?? 0 } },
  );
  if (usage.expiresAt) lines.push({ key: 'settings.ai.platform.expires', values: { date: usage.expiresAt } });
  return lines;
}

/** How much of the platform's monthly allowance is used, as a whole percent (0 when there is no cap). */
export function percentOfCapUsed(usage: Pick<AiPlatformUsage, 'monthlyCallCap' | 'usedThisMonth'>): number {
  if (usage.monthlyCallCap === null || usage.monthlyCallCap === 0) return 0;
  return Math.min(100, Math.round((usage.usedThisMonth / usage.monthlyCallCap) * 100));
}
