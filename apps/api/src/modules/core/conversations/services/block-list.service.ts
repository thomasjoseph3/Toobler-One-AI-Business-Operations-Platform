import { type BlockListEntry, type BlockListResponse, type ReplaceBlockListRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { parsePhone } from '../../../../kernel/phone';
import * as blockListRepository from '../repositories/block-list.repository';
import type { BlockListRow } from '../repositories/block-list.repository';

/** Turns a database row into the BlockListEntry the API answers with (the number gets its plus back). */
function toBlockListEntry(row: BlockListRow): BlockListEntry {
  return {
    id: row.id,
    phone: row.phoneKey === null ? null : `+${row.phoneKey}`,
    email: row.email,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The one text that says which number or email an entry is, so two ways of writing the same number match: "phone:919847012345" or "email:a@b.com". */
const identityOfRow = (row: Pick<BlockListRow, 'phoneKey' | 'email'>) =>
  row.phoneKey === null ? `email:${row.email}` : `phone:${row.phoneKey}`;

/** Everything about the block list that is not plain reading of the database. The routes call this. */
export function createBlockListService({ database }: { database: Database }) {
  return {
    /** The business's blocked numbers and emails, oldest first. Managers only (the route checks). */
    async listBlockList(principal: Pick<Principal, 'accountId'>): Promise<BlockListResponse> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const rows = await blockListRepository.listBlockListRows(transaction, principal.accountId);
        return { items: rows.map(toBlockListEntry) };
      });
    },

    /**
     * Saves the whole list: what is sent is what the business has afterwards. A number is read as the business's country when
     * typed without a country code, and an entry that cannot be a real phone number answers 400 INVALID_BLOCK_PHONE. The same
     * number or email twice (however it was written) answers 400 DUPLICATE_BLOCK_ENTRY. An entry that is already there keeps
     * its id, its date and who added it; only its reason can change. Writes an activity-log line that holds no numbers or
     * emails. Answers with the new list.
     */
    async replaceBlockList(
      principal: Pick<Principal, 'accountId' | 'userId' | 'defaultCountry'>,
      request: ReplaceBlockListRequest,
    ): Promise<BlockListResponse> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      // Turn what was typed into what is stored, and refuse anything that cannot be right, before the database is touched
      const wanted = new Map<string, { phoneKey: string | null; email: string | null; reason: string | null }>();
      for (const [position, entry] of request.items.entries()) {
        let phoneKey: string | null = null;
        if (entry.phone !== undefined) {
          const parsed = parsePhone(entry.phone, principal.defaultCountry as Parameters<typeof parsePhone>[1]);
          if (!parsed) {
            throw new ApiError(
              400,
              'INVALID_BLOCK_PHONE',
              `Entry ${position + 1} is not a phone number that could be real.`,
              {
                position: position + 1,
              },
            );
          }
          phoneKey = parsed.key;
        }
        const normalised = { phoneKey, email: entry.email ?? null, reason: entry.reason ?? null };
        const identity = identityOfRow(normalised);
        if (wanted.has(identity)) {
          throw new ApiError(400, 'DUPLICATE_BLOCK_ENTRY', `Entry ${position + 1} is already on the list above it.`, {
            position: position + 1,
          });
        }
        wanted.set(identity, normalised);
      }

      return database.runInAccountTransaction(accountId, async (transaction) => {
        // Saving compares with what is there, so two managers saving at the same moment must take turns
        await blockListRepository.lockBlockListOfBusiness(transaction, accountId);
        const currentRows = await blockListRepository.listBlockListRows(transaction, accountId);
        const currentByIdentity = new Map(currentRows.map((row) => [identityOfRow(row), row]));

        const idsToRemove = currentRows.filter((row) => !wanted.has(identityOfRow(row))).map((row) => row.id);
        let addedCount = 0;
        let reasonChangedCount = 0;
        for (const [identity, entry] of wanted) {
          const existing = currentByIdentity.get(identity);
          if (!existing) {
            await blockListRepository.insertBlockListEntry(transaction, { id: uuidv7(), accountId, ...entry, actor });
            addedCount += 1;
          } else if (existing.reason !== entry.reason) {
            await blockListRepository.updateBlockListReason(transaction, {
              accountId,
              entryId: existing.id,
              reason: entry.reason,
              actor,
            });
            reasonChangedCount += 1;
          }
        }
        await blockListRepository.deleteBlockListEntries(transaction, accountId, idsToRemove);

        if (addedCount > 0 || reasonChangedCount > 0 || idsToRemove.length > 0) {
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'conversations.block_list_replaced',
            // Which part changed, never which numbers or emails (they are personal data)
            details: { recordType: 'block_list', fields: ['entries'] },
          });
        }

        const rows = await blockListRepository.listBlockListRows(transaction, accountId);
        return { items: rows.map(toBlockListEntry) };
      });
    },
  };
}
