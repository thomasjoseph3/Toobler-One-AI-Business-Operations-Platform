import type { StageKind } from '@toobler-one/shared';

// Rule R6 (docs/REQUIREMENTS-REVIEW.md): what happens to a new enquiry from someone who already has a lead. Pure logic, no
// database: the lead routes and, later, the AI agent (F19) both ask it.

/** For this many days after a lead is closed, a new enquiry from the same person is treated as a continuation. */
export const REOPEN_WINDOW_DAYS = 60;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The newest lead of the person: where it stands, and when it was closed (null while it is open). */
export interface LatestLeadFacts {
  stageKind: StageKind;
  closedAt: Date | null;
}

/** What to do with the new enquiry. */
export type EnquiryDecision =
  /** The person has an open lead: the enquiry joins it. */
  | 'attach_to_open_lead'
  /** The lead was lost less than 60 days ago: reopen it at the first stage and tell the owner. */
  | 'reopen_lost_lead'
  /** The lead was won less than 60 days ago: the kind of conversation decides (a new purchase is a new lead, a question about the purchase is a ticket). */
  | 'decide_by_conversation_type'
  /** No lead, or the last one was closed 60 days ago or more: start a new lead. */
  | 'start_new_lead';

/** True when the lead was closed less than 60 days before `now`. Exactly 60 days ago counts as "long ago". */
function closedRecently(closedAt: Date, now: Date): boolean {
  return now.getTime() - closedAt.getTime() < REOPEN_WINDOW_DAYS * MILLISECONDS_PER_DAY;
}

/** Decides what to do with a new enquiry, given the person's newest lead (undefined if they have none). */
export function decideWhatToDoWithEnquiry(options: {
  latestLead: LatestLeadFacts | undefined;
  now: Date;
}): EnquiryDecision {
  const { latestLead, now } = options;
  if (!latestLead) return 'start_new_lead';
  if (latestLead.stageKind === 'open' || latestLead.closedAt === null) return 'attach_to_open_lead';
  if (!closedRecently(latestLead.closedAt, now)) return 'start_new_lead';
  return latestLead.stageKind === 'lost' ? 'reopen_lost_lead' : 'decide_by_conversation_type';
}
