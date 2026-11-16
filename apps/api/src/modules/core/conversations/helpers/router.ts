import type { ConversationAlert, ConversationOutcome, ConversationType } from '@toobler-one/shared';

// Step 4 of sorting a conversation (docs/CONVERSATION-TYPES.md): the router. The AI says what a conversation was about; this pure
// code decides what to do about it. The same classification and the same business rules always give the same decision.
// Pure: no database, no AI, no clock.

/** A conversation's confidence at or above this is applied as it is. */
export const APPLY_CONFIDENCE = 0.7;
/** From here up to APPLY_CONFIDENCE a type is applied but marked "AI unsure"; below it the conversation needs a person to look. */
export const UNSURE_CONFIDENCE = 0.4;
/** How many secondary reasons are looked at after the main one. */
export const MAX_SECONDARY_TYPES = 2;

/** The key of the type a conversation falls back to when the AI is not sure or named a type the business does not have. */
const FALLBACK_TYPE_KEY = 'unclear';

/** Types that never create a contact: spam, wrong numbers, silence and machine mail must not fill the contact list. */
const NO_CONTACT_TYPE_KEYS: ReadonlySet<string> = new Set(['spam', 'wrong_number', 'no_conversation', 'automated']);

/** The kinds and priorities a ticket can have, the same words the types and the tickets feature use. */
export type RoutedTicketType = NonNullable<ConversationType['ticketType']>;
export type RoutedTicketPriority = NonNullable<ConversationType['priority']>;

/** Whether a contact is kept for a conversation of this type that led to this kind of outcome (not for spam, wrong numbers, silence, machine mail, nor anything Filtered or Ignored). */
export function shouldKeepContact(typeKey: string, kind: ConversationOutcome): boolean {
  return !NO_CONTACT_TYPE_KEYS.has(typeKey) && kind !== 'filter' && kind !== 'ignore';
}

/** The parts of a business's type that the router needs. */
export type RoutableConversationType = Pick<
  ConversationType,
  'key' | 'outcome' | 'ticketType' | 'priority' | 'needsPerson' | 'alert' | 'isActive'
>;

/** What the AI (or a rule, or a person) said the conversation was about. Confidence runs from 0 to 1. */
export interface TypeClassification {
  primary: { typeKey: string; confidence: number };
  secondary: ReadonlyArray<{ typeKey: string; confidence: number }>;
  needsPerson: boolean;
}

/** Facts from our own data about the person (never from what they claim). */
export interface RoutingContext {
  /** The person's open lead, if they have one: a new enquiry goes onto it instead of making another. */
  openLead: { id: string } | null;
  /** The person's open ticket, if they have one: a follow-up about the same kind of thing goes onto it. */
  openTicket: { id: string; ticketType: RoutedTicketType } | null;
}

/** What the business has switched on. A lead needs the lead engine; tickets are core and always possible. */
export interface AccountRules {
  leadsActive: boolean;
}

/** One thing the conversation should lead to. */
export interface RoutedOutcome {
  /** The type that caused it. Each outcome is kept once per conversation and type, so running the router again updates it. */
  typeKey: string;
  kind: ConversationOutcome;
  confidence: number;
  /** Applied, but the AI was only fairly sure: staff confirm with one tap. */
  aiUnsure: boolean;
  /** For a ticket: its kind and priority. */
  ticket: { ticketType: RoutedTicketType; priority: RoutedTicketPriority } | null;
  /** Add to this existing open lead or ticket instead of making a new one. */
  reuseLeadId: string | null;
  reuseTicketId: string | null;
  /** Whether a contact is kept for this conversation. */
  keepContact: boolean;
  /** Only a sales outcome may move the contact's lifecycle stage; a complaint never turns someone into a "Lead". */
  movesLifecycleStage: boolean;
  needsPerson: boolean;
  alert: ConversationAlert | null;
  /** A lead was wanted but the lead engine is off: it is only logged, and a callback task is made instead. */
  createCallbackTask: boolean;
}

/** The router's answer for one conversation. */
export interface RoutingDecision {
  /** The type the conversation is shown under (the main one, or "unclear" when the AI was not sure). */
  primaryTypeKey: string;
  outcomes: RoutedOutcome[];
  /** Someone must look at this conversation. */
  needsPerson: boolean;
  /** At least one outcome was applied with only fair confidence. */
  aiUnsure: boolean;
}

/** A confidence that is not a real number between 0 and 1 counts as no confidence at all. */
function cleanConfidence(confidence: number): number {
  if (Number.isNaN(confidence)) return 0;
  return Math.min(1, Math.max(0, confidence));
}

/**
 * Builds the outcome for one type. The type must exist and be switched on (the caller checks).
 * `aiUnsure` is passed in because the confidence rule lives in `decide`.
 */
function buildOutcome(
  type: RoutableConversationType,
  options: { confidence: number; aiUnsure: boolean; context: RoutingContext; rules: AccountRules },
): RoutedOutcome {
  const { confidence, aiUnsure, context, rules } = options;

  // A lead needs the lead engine. With it off, the conversation is only logged and someone is asked to call back.
  const leadEngineIsOff = type.outcome === 'lead' && !rules.leadsActive;
  const kind: ConversationOutcome = leadEngineIsOff ? 'log' : type.outcome;

  const ticket =
    kind === 'ticket' && type.ticketType !== null && type.priority !== null
      ? { ticketType: type.ticketType, priority: type.priority }
      : null;
  // A follow-up about the same kind of thing goes onto the open ticket
  const reuseTicketId =
    ticket !== null && context.openTicket?.ticketType === ticket.ticketType ? context.openTicket.id : null;

  return {
    typeKey: type.key,
    kind,
    confidence,
    aiUnsure,
    ticket,
    reuseLeadId: kind === 'lead' ? (context.openLead?.id ?? null) : null,
    reuseTicketId,
    keepContact: shouldKeepContact(type.key, kind),
    movesLifecycleStage: kind === 'lead',
    needsPerson: type.needsPerson || kind === 'review',
    alert: type.alert,
    createCallbackTask: leadEngineIsOff,
  };
}

/**
 * Decides what a conversation leads to.
 *
 *  - The main type: confidence at or above 0.70 is applied; from 0.40 up to 0.70 it is applied and marked "AI unsure"; below 0.40
 *    (or a type the business does not have or has switched off) it becomes "unclear", which needs a person and makes no lead or ticket.
 *  - Up to two secondary reasons are looked at the same way, except that one the AI is not sure about, or does not exist, is left out:
 *    a guess must not create work. A complaint plus a booking enquiry gives a ticket AND a lead.
 *  - At most one outcome of each kind: if two types would both make a lead (or both a ticket), the first, which is the more
 *    important, wins.
 *  - An open lead or ticket of the person is reused instead of making another.
 *  - If the lead engine is off, a lead becomes "only log it" plus a callback task.
 *
 * `types` is the business's list; the same input always gives the same answer.
 */
export function decide(
  types: readonly RoutableConversationType[],
  classification: TypeClassification,
  context: RoutingContext,
  rules: AccountRules,
): RoutingDecision {
  const activeTypesByKey = new Map(types.filter((type) => type.isActive).map((type) => [type.key, type]));
  const fallbackType = activeTypesByKey.get(FALLBACK_TYPE_KEY);

  // The main type, or "unclear" when it cannot be trusted
  const primaryConfidence = cleanConfidence(classification.primary.confidence);
  const primaryType = activeTypesByKey.get(classification.primary.typeKey);
  const primaryIsTrusted = primaryType !== undefined && primaryConfidence >= UNSURE_CONFIDENCE;

  const outcomes: RoutedOutcome[] = [];
  let primaryTypeKey = FALLBACK_TYPE_KEY;
  if (primaryIsTrusted) {
    primaryTypeKey = primaryType.key;
    outcomes.push(
      buildOutcome(primaryType, {
        confidence: primaryConfidence,
        aiUnsure: primaryConfidence < APPLY_CONFIDENCE,
        context,
        rules,
      }),
    );
  } else if (fallbackType !== undefined) {
    outcomes.push(buildOutcome(fallbackType, { confidence: primaryConfidence, aiUnsure: false, context, rules }));
  } else {
    // The business has somehow lost its "unclear" type (the system types cannot be removed, so this is a safety net): a person must look
    outcomes.push({
      typeKey: FALLBACK_TYPE_KEY,
      kind: 'review',
      confidence: primaryConfidence,
      aiUnsure: false,
      ticket: null,
      reuseLeadId: null,
      reuseTicketId: null,
      keepContact: true,
      movesLifecycleStage: false,
      needsPerson: true,
      alert: null,
      createCallbackTask: false,
    });
  }

  // Secondary reasons: only those the AI is fairly sure about, once per type
  const typeKeysDone = new Set<string>([primaryTypeKey]);
  for (const secondary of classification.secondary.slice(0, MAX_SECONDARY_TYPES)) {
    const type = activeTypesByKey.get(secondary.typeKey);
    const confidence = cleanConfidence(secondary.confidence);
    if (type === undefined || confidence < UNSURE_CONFIDENCE || typeKeysDone.has(type.key)) continue;
    typeKeysDone.add(type.key);
    outcomes.push(buildOutcome(type, { confidence, aiUnsure: confidence < APPLY_CONFIDENCE, context, rules }));
  }

  // At most one outcome of each kind: the first (the more important) wins
  const kindsSeen = new Set<ConversationOutcome>();
  const oneOfEachKind = outcomes.filter((outcome) => {
    if (kindsSeen.has(outcome.kind)) return false;
    kindsSeen.add(outcome.kind);
    return true;
  });

  return {
    primaryTypeKey,
    outcomes: oneOfEachKind,
    needsPerson: classification.needsPerson || oneOfEachKind.some((outcome) => outcome.needsPerson),
    aiUnsure: oneOfEachKind.some((outcome) => outcome.aiUnsure),
  };
}
