import type { Db } from '../../../../kernel/database';
import type { LlmProviderId } from '../../../../providers/llm';

// The SQL for `ai_platform_key_checks`: what the daily check found about the platform's own AI keys, by position (never the key).
// The table is shared by every business, so these queries are not fenced to one. The check job (slice 9) writes it.

/** What the last check found about one key. */
export interface PlatformKeyCheckRow {
  provider: LlmProviderId;
  keyPosition: number;
  status: 'working' | 'limited' | 'failed';
  statusNote: string | null;
  checkedAt: Date;
}

/** Every stored check. */
export async function findAllChecks(db: Db): Promise<PlatformKeyCheckRow[]> {
  const rows = await db
    .selectFrom('ai_platform_key_checks')
    .selectAll()
    .orderBy('provider')
    .orderBy('key_position')
    .execute();
  return rows.map((row) => ({
    provider: row.provider,
    keyPosition: row.key_position,
    status: row.status,
    statusNote: row.status_note,
    checkedAt: row.checked_at,
  }));
}
