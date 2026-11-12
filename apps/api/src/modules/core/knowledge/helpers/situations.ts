import type { SituationKey } from '@toobler-one/shared';

// The seven situations (E1 to E7 of the requirement): how the business wants a common moment handled. The first choice of
// each is the ready-picked default, so a new business has sensible handling without answering anything. Plain data.

export interface SituationChoice {
  key: string;
  label: string;
}

export interface SituationDefinition {
  key: SituationKey;
  /** "When this happens". */
  text: string;
  /** True when the requirement fixes the handling for Phase 1: it is shown but cannot be changed. */
  fixed: boolean;
  /** The choices, the default first. A fixed situation has exactly one. */
  choices: readonly SituationChoice[];
}

export const SITUATIONS: readonly SituationDefinition[] = [
  {
    key: 'discount_request',
    text: 'A customer asks for a discount',
    fixed: false,
    choices: [
      { key: 'staff_call_with_best_price', label: 'Staff will call with the best price' },
      { key: 'prices_are_fixed', label: 'Prices are fixed' },
      { key: 'tell_current_offer', label: 'Tell them our current offer' },
    ],
  },
  {
    key: 'not_available',
    text: "You don't have what they want, or you're full",
    fixed: false,
    choices: [
      { key: 'take_details_staff_call_back', label: 'Take details, staff call back' },
      { key: 'suggest_something_similar', label: 'Suggest something similar we have' },
    ],
  },
  {
    key: 'speak_to_person',
    text: 'A customer asks to speak to a person',
    fixed: false,
    choices: [
      {
        key: 'transfer_in_office_hours_else_callback',
        label: 'Transfer during office hours, otherwise promise a callback',
      },
      { key: 'always_promise_callback', label: 'Always promise a callback' },
    ],
  },
  {
    key: 'complaint',
    text: 'A customer complains',
    fixed: true,
    choices: [
      { key: 'apologise_pass_to_manager_raise_ticket', label: 'Apologise, pass to the manager, raise a ticket' },
    ],
  },
  {
    key: 'exact_price',
    text: 'A customer asks for an exact final price',
    fixed: true,
    choices: [
      {
        key: 'give_from_price_staff_confirm',
        label: 'Give the "from" price and say staff will confirm the exact price',
      },
    ],
  },
  {
    key: 'unknown_answer',
    text: "The AI doesn't know the answer",
    fixed: true,
    choices: [{ key: 'say_team_will_call_back_and_log', label: 'Say the team will call back, and log the question' }],
  },
  {
    key: 'after_hours',
    text: 'A customer calls after hours',
    fixed: false,
    choices: [
      {
        key: 'call_at_opening_and_offer_whatsapp',
        label: 'Promise a call at opening time and offer details on WhatsApp',
      },
      { key: 'call_at_opening_only', label: 'Promise a call at opening time only' },
    ],
  },
];

/** The definition of one situation, or undefined when the key is not one of the seven. */
export function findSituation(situationKey: string): SituationDefinition | undefined {
  return SITUATIONS.find((situation) => situation.key === situationKey);
}

/** The key of the choice a situation starts with: its first one. */
export function defaultChoiceKey(situation: SituationDefinition): string {
  return situation.choices[0]!.key;
}
