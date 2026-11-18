import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { scoreLead } from '../helpers/score';
import * as leadsRepository from '../repositories/leads.repository';

/** What a conversation taught us that scores its lead. */
export interface ConversationFactsForScoring {
  askedPrice: boolean;
  askedToBook: boolean;
  dateFrom: string | null;
  dateTo: string | null;
}

/**
 * After a conversation: adds what it taught us to the lead, then scores the lead by the fixed rules (code decides, never the AI). The new score
 * replaces one a person set by hand ("until the next conversation"). Run it inside the business's own transaction; `today` is today's date in the
 * business's time zone. Used by the agents module (through this module's index.ts). Returns the temperature given, or undefined if there is no such lead.
 */
export async function scoreLeadFromConversation(
  transaction: Db,
  options: { accountId: string; leadId: string; facts: ConversationFactsForScoring; today: string; actor: Actor },
): Promise<'hot' | 'warm' | 'cold' | undefined> {
  const { accountId, leadId, facts, actor } = options;
  await leadsRepository.addConversationFactsToLead(transaction, { accountId, leadId, ...facts, actor });
  const lead = await leadsRepository.findLeadById(transaction, accountId, leadId);
  if (!lead) return undefined;

  const score = scoreLead({
    askedToBook: lead.askedToBook,
    askedPrice: lead.askedPrice,
    dateFrom: lead.dateFrom,
    dateTo: lead.dateTo,
    today: options.today,
  });
  const unchanged =
    lead.temperature === score.temperature &&
    lead.temperatureReason === score.reason &&
    lead.temperatureSetBy === 'rules';
  if (!unchanged) {
    await leadsRepository.setLeadTemperature(transaction, {
      accountId,
      leadId,
      temperature: score.temperature,
      reason: score.reason,
      setBy: 'rules',
      actor,
    });
    await writeActivityLog(transaction, {
      accountId,
      actor,
      kind: 'leads.scored',
      details: { recordType: 'lead', recordId: leadId, fields: ['temperature'] },
    });
  }
  return score.temperature;
}
