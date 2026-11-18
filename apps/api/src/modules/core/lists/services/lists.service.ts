import {
  MAX_LIST_MEMBERS,
  type ContactList,
  type ContactListsResponse,
  type CreateListRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { findContactIdsMatchingView, findLiveContactIds } from '../../contacts';
import * as contactListsRepository from '../repositories/contact-lists.repository';
import type { ContactListRow } from '../repositories/contact-lists.repository';

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** Turns a stored list into the ContactList the API answers with. */
function toContactList(row: ContactListRow): ContactList {
  return { id: row.id, name: row.name, memberCount: row.memberCount, createdAt: row.createdAt.toISOString() };
}

/** Static contact lists (F11): a fixed group of contacts, saved from a contacts view or built by hand. */
export function createListsService({ database }: { database: Database }) {
  return {
    /** All the business's lists, oldest first, each with how many contacts it has. */
    async listLists(principal: Pick<Principal, 'accountId'>): Promise<ContactListsResponse> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const rows = await contactListsRepository.listContactLists(transaction, principal.accountId);
        return { items: rows.map(toContactList) };
      });
    },

    /**
     * Makes a list. With `contactIds` those contacts go in (any that is not a live contact of the business is 404, and nothing is saved); with `fromView` every
     * contact that matches the view right now goes in, once (a view that matches more than 5000 is 409 LIST_TOO_BIG, a bad filter is 400 INVALID_FILTERS);
     * with neither the list starts empty. A business never has two lists with the same name, whatever the capitals (409 LIST_NAME_TAKEN).
     */
    async createList(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateListRequest,
    ): Promise<ContactList> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          let contactIds: string[] = [];
          if (request.contactIds !== undefined) {
            const uniqueIds = [...new Set(request.contactIds)];
            const live = new Set(await findLiveContactIds(transaction, { accountId, contactIds: uniqueIds }));
            if (uniqueIds.some((contactId) => !live.has(contactId))) throw notFound('One of those contacts');
            contactIds = uniqueIds;
          } else if (request.fromView !== undefined) {
            contactIds = await findContactIdsMatchingView(transaction, {
              accountId,
              view: request.fromView,
              limit: MAX_LIST_MEMBERS + 1,
            });
            if (contactIds.length > MAX_LIST_MEMBERS) {
              throw conflict(
                'LIST_TOO_BIG',
                `That view matches more than ${MAX_LIST_MEMBERS} contacts. Narrow it first.`,
              );
            }
          }
          const listId = uuidv7();
          await contactListsRepository.insertContactList(transaction, {
            id: listId,
            accountId,
            name: request.name,
            actor,
          });
          await contactListsRepository.addMembers(transaction, { accountId, listId, contactIds, actor });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'lists.created',
            details: { recordType: 'list', recordId: listId, fields: ['name', 'members'] },
          });
          const created = await contactListsRepository.findContactListById(transaction, accountId, listId);
          if (!created) throw new Error('The list that was just made could not be read');
          return toContactList(created);
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) {
          throw new ApiError(409, 'LIST_NAME_TAKEN', 'You already have a list with that name. Choose another name.');
        }
        throw error;
      }
    },
  };
}
