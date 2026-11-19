import type { MailMessage } from '../../../../providers/mail';

// The wording of the AI warning emails. Pure: each builder returns the email for one person. They name keys by the label the manager
// gave them or by their place in the list, and never hold a key. Anything a person typed (a key label) is escaped in the HTML.

/** Makes text safe to put inside HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface NoticeRecipient {
  name: string;
  email: string;
}

/** Builds one email from a subject and the paragraphs of its body. */
function composeEmail(recipient: NoticeRecipient, subject: string, paragraphs: string[]): MailMessage {
  const greeting = `Hi ${recipient.name},`;
  return {
    to: recipient.email,
    subject,
    text: [greeting, '', ...paragraphs.flatMap((paragraph) => [paragraph, ''])].join('\n').trimEnd(),
    html: [`<p>${escapeHtml(greeting)}</p>`, ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)].join(
      '\n',
    ),
  };
}

const COMPANY_NAMES = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude' } as const;
type Company = keyof typeof COMPANY_NAMES;

/** A business's own key has a problem: tells its managers which key, what is wrong, and what to do. */
export function buildOwnKeyProblemEmail(
  recipient: NoticeRecipient,
  key: { label: string; provider: Company; status: 'failed' | 'limited'; note: string },
): MailMessage {
  const company = COMPANY_NAMES[key.provider];
  return composeEmail(recipient, `Your ${company} key "${key.label}" needs attention`, [
    key.status === 'failed'
      ? `Your ${company} key "${key.label}" stopped working. ${key.note}`
      : `Your ${company} key "${key.label}" has run into a limit. ${key.note}`,
    'Until it is fixed, the AI uses your other keys, or the platform keys if your business is allowed to use them. If no key works, the AI cannot answer customers.',
    'Open Settings, then AI connections, to test the key, replace it or remove it.',
  ]);
}

/** One of the platform's own keys has a problem: tells the platform team which one (by its place in the list). */
export function buildPlatformKeyProblemEmail(
  recipient: NoticeRecipient,
  key: { provider: Company; keyPosition: number; status: 'failed' | 'limited'; note: string },
): MailMessage {
  const company = COMPANY_NAMES[key.provider];
  return composeEmail(recipient, `Platform ${company} key ${key.keyPosition} needs attention`, [
    `Platform ${company} key number ${key.keyPosition} in the server settings is ${key.status === 'failed' ? 'failing' : 'limited'}. ${key.note}`,
    "Businesses on the platform keys rotate to the other keys, but if all of a company's keys fail, those businesses lose AI answers.",
    'Replace or remove the key in the server settings (.env), then check Platform keys in the admin.',
  ]);
}

/** Models of ours a company no longer lists. */
export function buildModelsMissingEmail(
  recipient: NoticeRecipient,
  provider: Company,
  modelNames: string[],
): MailMessage {
  const company = COMPANY_NAMES[provider];
  return composeEmail(recipient, `${company} no longer lists ${modelNames.length} of our models`, [
    `${company} no longer lists: ${modelNames.join(', ')}.`,
    'Jobs that use them fall back to the next model in their order, so customers are still answered. Choose replacements, or mark the old models as retired, in the admin model list.',
  ]);
}

/** New models a company now offers. */
export function buildNewModelsEmail(recipient: NoticeRecipient, provider: Company, modelNames: string[]): MailMessage {
  const company = COMPANY_NAMES[provider];
  return composeEmail(
    recipient,
    `${company} offers ${modelNames.length} new model${modelNames.length === 1 ? '' : 's'}`,
    [
      `${company} now offers: ${modelNames.join(', ')}.`,
      'Nothing changes by itself. Add a model to the list in the admin, test how fast it answers and how well it does on our sample conversations, then put it into the jobs it suits.',
    ],
  );
}

/** A model retires soon, or has passed its date. */
export function buildModelRetiringEmail(
  recipient: NoticeRecipient,
  model: { label: string; modelName: string; retiresOn: string; warning: '30_days' | '7_days' | 'passed' },
): MailMessage {
  const when =
    model.warning === 'passed'
      ? `passed its retirement date (${model.retiresOn})`
      : `retires on ${model.retiresOn}, ${model.warning === '7_days' ? 'within 7 days' : 'within 30 days'}`;
  return composeEmail(
    recipient,
    `${model.label} ${model.warning === 'passed' ? 'has reached its retirement date' : 'is retiring soon'}`,
    [
      `${model.label} (${model.modelName}) ${when}.`,
      'Replace it in the jobs that use it before then, using the admin model list, and mark it retired when it is gone.',
    ],
  );
}

/** A job keeps falling back to other models. */
export function buildFallbackStormEmail(
  recipient: NoticeRecipient,
  detail: { taskLabel: string; count: number; usingPlatformKeys: boolean },
): MailMessage {
  return composeEmail(recipient, `The AI keeps falling back for "${detail.taskLabel}"`, [
    `In the last hour, "${detail.taskLabel}" needed a fallback model ${detail.count} times. The first choice is failing or too busy.`,
    detail.usingPlatformKeys
      ? 'These calls were on the platform keys. Check Platform keys and the model list in the admin.'
      : 'These calls were on your own keys. Open Settings, then AI connections, to check your keys.',
  ]);
}
