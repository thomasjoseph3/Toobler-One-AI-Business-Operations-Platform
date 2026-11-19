import type { LifecycleStage } from '@toobler-one/shared';

// The lifecycle rules, as pure logic (no database). Contacts start as `new`; leads (F06) will feed the facts below.

/** What we know about a contact that decides its stage. */
export interface LifecycleFacts {
  /** Staff marked the contact as spam, a wrong number or never buying */
  markedNotAFit: boolean;
  /** How many leads of the contact are still open */
  openLeads: number;
  /** How many leads of the contact were won */
  wonLeads: number;
}

/**
 * The stage a contact is in, worked out from the facts. "Not a fit" is staff's decision and always wins; then two or more
 * won leads make a repeat customer, one won lead a customer, an open lead a lead, and otherwise the contact is new.
 */
export function computeLifecycleStage(facts: LifecycleFacts): LifecycleStage {
  if (facts.markedNotAFit) return 'not_a_fit';
  if (facts.wonLeads >= 2) return 'repeat_customer';
  if (facts.wonLeads === 1) return 'customer';
  if (facts.openLeads > 0) return 'lead';
  return 'new';
}
