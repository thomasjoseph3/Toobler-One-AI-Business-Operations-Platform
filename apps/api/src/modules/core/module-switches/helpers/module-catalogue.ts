// The list of every module a business can switch on or off. Core modules (sign-in, industries...) are always on and are
// not listed. A real module's manifest must match its line here (checked by a test), so no module can exist without a switch.

export interface CatalogueEntry {
  /** `<kind>.<name>`, the same id the module's manifest uses */
  id: string;
  kind: 'engine' | 'channel' | 'feature';
  /** Short name shown on the Settings → Modules screen */
  name: string;
  /** One sentence: what the business gets when it is on */
  description: string;
  /** Modules that must be active first (a feature needs the engine it works on) */
  requires: string[];
}

/** Every Phase 1 module, in the order the Settings screen shows them. */
export const MODULE_CATALOGUE: readonly CatalogueEntry[] = [
  {
    id: 'engine.leads',
    kind: 'engine',
    name: 'Lead engine',
    description: 'Turns enquiries into leads, scores them and moves them through your pipeline.',
    requires: [],
  },
  {
    id: 'channel.webchat',
    kind: 'channel',
    name: 'Website chat',
    description: 'A chat on your website where the AI answers visitors and captures their details.',
    requires: [],
  },
  {
    id: 'channel.whatsapp',
    kind: 'channel',
    name: 'WhatsApp',
    description: 'Lets the AI answer WhatsApp messages. You connect your own WhatsApp Business account.',
    requires: [],
  },
  {
    id: 'channel.email',
    kind: 'channel',
    name: 'Email',
    description: 'Lets the AI read and draft replies to enquiries sent to your email address.',
    requires: [],
  },
  {
    id: 'channel.phone',
    kind: 'channel',
    name: 'Phone and web calls',
    description: 'Lets the AI answer calls, in the browser or on a phone number, in Malayalam, Hindi or English.',
    requires: [],
  },
  {
    id: 'feature.followups',
    kind: 'feature',
    name: 'Follow-ups',
    description: 'Reminds your team, and the AI, to follow up on leads that have gone quiet.',
    requires: ['engine.leads'],
  },
  {
    id: 'feature.assistant',
    kind: 'feature',
    name: 'Staff assistant',
    description: 'An AI assistant your team can ask about leads, tasks and customers.',
    requires: ['engine.leads'],
  },
  {
    id: 'feature.competitors',
    kind: 'feature',
    name: 'Competitor watch',
    description: 'Keeps an eye on competitors and tells you what changed.',
    requires: ['engine.leads'],
  },
];

/** The modules a new business starts with: in its plan and switched on. Everything else is added by Toobler. */
export const STARTING_MODULE_IDS: readonly string[] = ['engine.leads', 'channel.webchat'];

/** The catalogue entry for a module id, or undefined when there is no such module. */
export function findCatalogueEntry(moduleId: string): CatalogueEntry | undefined {
  return MODULE_CATALOGUE.find((entry) => entry.id === moduleId);
}
