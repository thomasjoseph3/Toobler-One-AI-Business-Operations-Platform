import type { WeeklyHoursValue } from '@toobler-one/shared';
import { z } from 'zod';
import { chooseThePromise, type ChosenPromise, type PromiseSituation } from './choose-promise';

// What the agent has learned in one conversation, and the rules for how it changes. The model only calls tools with what the customer
// said; THESE rules decide when a promise is made and which one. Every function returns a new state and leaves the old one as it was.
// Pure: no database.

/** Everything remembered about one conversation. It is kept between messages by whoever runs the agent. */
export interface AgentConversationState {
  /** What the customer has told us, by label: "Name", "Phone"... Only what they said. */
  details: Readonly<Record<string, string>>;
  /** What this conversation is, for choosing the promise. */
  situation: PromiseSituation;
  /** The one promise made, or null while none has been. */
  promise: ChosenPromise | null;
  /** The reason the agent gave when it asked for a person (never the customer's own words, kept short), or null. */
  callbackReason: string | null;
  /** What the tools gave back earlier in this conversation (the latest few), so a price a tool gave a few messages ago may be repeated. */
  earlierToolResults: readonly string[];
}

export const EMPTY_AGENT_CONVERSATION_STATE: AgentConversationState = {
  details: {},
  situation: 'sale_enquiry',
  promise: null,
  callbackReason: null,
  earlierToolResults: [],
};

/** What the rules need to know about now and about the business, to choose a promise. */
export interface PromiseContext {
  now: Date;
  timeZone: string;
  weeklyHours: WeeklyHoursValue | undefined;
  /** How many minutes the business promises to call back within while it is open. Left out, the standard 15 is used. */
  callbackMinutes?: number | undefined;
  /**
   * True when a promise was already made in an EARLIER message, so the customer has heard it and it cannot change. When it is false (or
   * left out), a promise made earlier in this same message has not been said yet, so a better one may replace it.
   */
  promiseSaidInEarlierMessage?: boolean;
}

/**
 * True when the promise already chosen in this same message should be replaced because the conversation turned out to be something
 * else: a sales callback when it is a complaint, or a callback when the customer is ready to book. Nothing the customer has heard is changed.
 */
function shouldReplaceUnsaidPromise(state: AgentConversationState, context: PromiseContext): boolean {
  if (!state.promise || context.promiseSaidInEarlierMessage !== false) return false;
  if (state.situation === 'not_a_sale') return state.promise.kind !== 'passed_to_manager';
  if (state.situation === 'ready_to_book') {
    return state.promise.kind === 'call_back_open' || state.promise.kind === 'call_back_closed';
  }
  return false;
}

/** What a tool gives back to the model, and the state after the tool ran. */
export interface StateChange {
  state: AgentConversationState;
  /** Written for the model: what was saved, and what to say or ask next. */
  messageForModel: string;
}

const SHORT_TEXT = z.string().trim().min(1).max(200);

/** What the model may save about a customer. Every field is optional: it saves what it has learned so far. */
export const saveDetailsInputSchema = z
  .object({
    name: SHORT_TEXT.optional().describe("The customer's name, as they gave it"),
    phone: SHORT_TEXT.optional().describe("The customer's phone number, as they typed it"),
    email: SHORT_TEXT.optional().describe("The customer's email address"),
    company: SHORT_TEXT.optional().describe(
      'The firm, school or group they are booking or asking for, only if they said it',
    ),
    interestedIn: SHORT_TEXT.optional().describe('What they want or are asking about'),
    dates: SHORT_TEXT.optional().describe('Any dates they mentioned, as they said them'),
    numberOfPeople: SHORT_TEXT.optional().describe('How many people, as they said it'),
    budget: SHORT_TEXT.optional().describe('Their budget, only if they offered one'),
    bestTimeToCall: SHORT_TEXT.optional().describe('When they would like to be called'),
    readyToBook: z
      .boolean()
      .optional()
      .describe('Set to true, in the same call, when the customer says they want to book or to go ahead'),
  })
  .strict();
export type SaveDetailsInput = z.infer<typeof saveDetailsInputSchema>;

/** The labels the details are kept under (and shown to the model under). */
const DETAIL_LABELS = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  company: 'Company',
  interestedIn: 'Interested in',
  dates: 'Dates',
  numberOfPeople: 'Number of people',
  budget: 'Budget',
  bestTimeToCall: 'Best time to call',
} as const;

/** True when the text looks like a phone number: 7 to 15 digits, with only spaces, dashes, brackets and a leading + around them. */
export function looksLikePhoneNumber(text: string): boolean {
  if (!/^\+?[\d\s\-()]+$/.test(text.trim())) return false;
  const digitCount = text.replace(/\D/g, '').length;
  return digitCount >= 7 && digitCount <= 15;
}

/** True when the text looks like an email address (one @, a dot in the part after it, no spaces). */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** Says the promise to make, or that one was already made, in the words the model must use. */
function describeThePromiseForTheModel(state: AgentConversationState, justMade: boolean): string {
  if (!state.promise) return '';
  return justMade
    ? `Now say exactly this to the customer, in these words: "${state.promise.sentence}" Make no other promise.`
    : `A promise was already made ("${state.promise.sentence}"). Do not make another one.`;
}

/**
 * Saves what the customer told us, and decides whether it is time to make the promise. A phone or an email that does not look right is
 * not saved, and the model is told to ask again. The promise is made at most once, and only when the customer can be reached.
 */
export function recordDetails(
  state: AgentConversationState,
  input: SaveDetailsInput,
  context: PromiseContext,
): StateChange {
  const details: Record<string, string> = { ...state.details };
  const problems: string[] = [];
  for (const [field, label] of Object.entries(DETAIL_LABELS) as [keyof typeof DETAIL_LABELS, string][]) {
    const given = input[field];
    if (given === undefined) continue;
    if (field === 'phone' && !looksLikePhoneNumber(given)) {
      problems.push('That phone number does not look right: ask the customer to check it.');
      continue;
    }
    if (field === 'email' && !looksLikeEmail(given)) {
      problems.push('That email address does not look right: ask the customer to check it.');
      continue;
    }
    details[label] = given;
  }
  // A person who is not a sale stays not a sale; otherwise ready to book is remembered
  const situation: PromiseSituation =
    state.situation === 'not_a_sale' ? 'not_a_sale' : input.readyToBook === true ? 'ready_to_book' : state.situation;
  const afterSaving: AgentConversationState = { ...state, details, situation };

  const replacingTheUnsaidPromise = shouldReplaceUnsaidPromise(afterSaving, context);
  if (afterSaving.promise && !replacingTheUnsaidPromise) {
    return {
      state: afterSaving,
      messageForModel: ['Saved.', ...problems, describeThePromiseForTheModel(afterSaving, false)].join(' '),
    };
  }

  const canBeCalled = details['Phone'] !== undefined;
  const canBeReached = canBeCalled || details['Email'] !== undefined;
  const readyToPromise = situation === 'sale_enquiry' ? canBeCalled : canBeReached;
  if (!readyToPromise) {
    const missing =
      situation === 'sale_enquiry' ? "the customer's phone number" : "the customer's phone number or email";
    return {
      state: afterSaving,
      messageForModel: [
        'Saved.',
        ...problems,
        `You still need ${missing} so the team can follow up. Ask for it, one question. Make no promise yet.`,
      ].join(' '),
    };
  }

  const promise = chooseThePromise({ situation, ...context });
  const afterPromise: AgentConversationState = { ...afterSaving, promise };
  return {
    state: afterPromise,
    messageForModel: ['Saved.', ...problems, describeThePromiseForTheModel(afterPromise, true)].join(' '),
  };
}

/** The most characters kept of the reason the agent gave for asking for a person. */
const CALLBACK_REASON_MAX = 300;

/**
 * The agent asks for a person to follow up (a complaint, a problem, anything that is not a sale). The conversation is then not a sale, and
 * the promise is "passed to the manager". If a promise was already made, it stays: only one is ever made.
 */
export function recordHumanCallback(
  state: AgentConversationState,
  reason: string,
  context: PromiseContext,
): StateChange {
  const afterRequest: AgentConversationState = {
    ...state,
    situation: 'not_a_sale',
    callbackReason: reason.trim().slice(0, CALLBACK_REASON_MAX),
  };
  if (afterRequest.promise && !shouldReplaceUnsaidPromise(afterRequest, context)) {
    return {
      state: afterRequest,
      messageForModel: `Noted: a person will follow up. ${describeThePromiseForTheModel(afterRequest, false)}`,
    };
  }
  const canBeReached = afterRequest.details['Phone'] !== undefined || afterRequest.details['Email'] !== undefined;
  if (!canBeReached) {
    return {
      state: afterRequest,
      messageForModel:
        "Noted. You still need the customer's phone number or email so the manager can reply. Ask for it, one question, then call save_details. Make no promise yet.",
    };
  }
  const promise = chooseThePromise({ situation: 'not_a_sale', ...context });
  const afterPromise: AgentConversationState = { ...afterRequest, promise };
  return {
    state: afterPromise,
    messageForModel: `Noted: a person will follow up. ${describeThePromiseForTheModel(afterPromise, true)}`,
  };
}
