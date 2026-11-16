import type { ConversationOutcome } from '@toobler-one/shared';
import type { Db } from '../../../../kernel/database';

// The SQL for the `conversation_outcomes` table: what each conversation led to, once per conversation and type.

/** An outcome as the database holds it. */
export interface ConversationOutcomeRow {
  id: string;
  typeKey: string;
  kind: ConversationOutcome;
  confidence: number;
  aiUnsure: boolean;
  leadId: string | null;
  ticketId: string | null;
  appliedAt: Date | null;
  supersededAt: Date | null;
}

/** All the outcomes of a conversation, in the order they were made. */
export async function listOutcomesOfConversation(
  db: Db,
  accountId: string,
  conversationId: string,
): Promise<ConversationOutcomeRow[]> {
  const rows = await db
    .selectFrom('conversation_outcomes')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    typeKey: row.type_key,
    kind: row.kind,
    confidence: Number(row.confidence),
    aiUnsure: row.ai_unsure,
    leadId: row.lead_id,
    ticketId: row.ticket_id,
    appliedAt: row.applied_at,
    supersededAt: row.superseded_at,
  }));
}

/**
 * Saves one outcome for a conversation and type. When that type already has an outcome on this conversation (the conversation was
 * sorted again), it is updated in place and made current again, so sorting twice never makes two.
 */
export async function upsertOutcome(
  db: Db,
  outcome: {
    id: string;
    accountId: string;
    conversationId: string;
    typeKey: string;
    kind: ConversationOutcome;
    confidence: number;
    aiUnsure: boolean;
  },
): Promise<void> {
  await db
    .insertInto('conversation_outcomes')
    .values({
      id: outcome.id,
      account_id: outcome.accountId,
      conversation_id: outcome.conversationId,
      type_key: outcome.typeKey,
      kind: outcome.kind,
      confidence: outcome.confidence,
      ai_unsure: outcome.aiUnsure,
    })
    .onConflict((conflict) =>
      conflict.columns(['conversation_id', 'type_key']).doUpdateSet({
        kind: outcome.kind,
        confidence: outcome.confidence,
        ai_unsure: outcome.aiUnsure,
        superseded_at: null,
      }),
    )
    .execute();
}

/** Marks the outcomes of a conversation whose types are NOT in the given list as no longer applying (their leads and tickets are kept). */
export async function supersedeOutcomesExceptTypes(
  db: Db,
  options: { accountId: string; conversationId: string; typeKeysToKeep: readonly string[]; at: Date },
): Promise<void> {
  let query = db
    .updateTable('conversation_outcomes')
    .set({ superseded_at: options.at })
    .where('account_id', '=', options.accountId)
    .where('conversation_id', '=', options.conversationId)
    .where('superseded_at', 'is', null);
  if (options.typeKeysToKeep.length > 0) query = query.where('type_key', 'not in', [...options.typeKeysToKeep]);
  await query.execute();
}

/** Records that an outcome was carried out, and which lead or ticket it made or joined (neither for an outcome that makes nothing). */
export async function markOutcomeApplied(
  db: Db,
  options: { accountId: string; outcomeId: string; leadId: string | null; ticketId: string | null; appliedAt: Date },
): Promise<void> {
  await db
    .updateTable('conversation_outcomes')
    .set({ lead_id: options.leadId, ticket_id: options.ticketId, applied_at: options.appliedAt })
    .where('account_id', '=', options.accountId)
    .where('id', '=', options.outcomeId)
    .execute();
}
