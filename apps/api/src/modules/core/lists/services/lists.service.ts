import {
  MAX_LIST_MEMBERS,
  type AddListMembersRequest,
  type AddListMembersResponse,
  type ContactList,
  type ListMembersQuery,
  type ListMembersResponse,
  type ContactListsResponse,
  type CreateListRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
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

    /** One page of a list's people (live contacts only), most recently added first, with the list. An unknown list and another business's list are 404. */
    async listMembers(
      principal: Pick<Principal, 'accountId'>,
      listId: string,
      query: ListMembersQuery,
    ): Promise<ListMembersResponse> {
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const list = await contactListsRepository.findContactListById(transaction, accountId, listId);
        if (!list) throw notFound('That list');
        const { rows, total } = await contactListsRepository.listMembers(transaction, {
          accountId,
          listId,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        });
        return {
          list: toContactList(list),
          items: rows.map((row) => ({
            id: row.contactId,
            name: row.name,
            phone: row.phone,
            email: row.email,
            addedAt: row.addedAt.toISOString(),
          })),
          total,
          page: query.page,
          limit: query.limit,
        };
      });
    },

    /**
     * Puts more contacts in a list. A contact already in it is left as it is (and not counted as added). A contact that is not a live contact of the
     * business is 404 and nothing is saved; an unknown list is 404; a list that would pass 5000 contacts is 409 LIST_FULL. Two requests at the same moment
     * take turns, so the limit always holds. Answers with how many were added and the list as it is now.
     */
    async addMembers(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      listId: string,
      request: AddListMembersRequest,
    ): Promise<AddListMembersResponse> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await contactListsRepository.lockContactList(transaction, accountId, listId)))
          throw notFound('That list');
        const uniqueIds = [...new Set(request.contactIds)];
        const live = new Set(await findLiveContactIds(transaction, { accountId, contactIds: uniqueIds }));
        if (uniqueIds.some((contactId) => !live.has(contactId))) throw notFound('One of those contacts');

        const before = await contactListsRepository.findContactListById(transaction, accountId, listId);
        if (!before) throw notFound('That list');
        const added = await contactListsRepository.addMembers(transaction, {
          accountId,
          listId,
          contactIds: uniqueIds,
          actor,
        });
        // Some of them may already be in the list, so the size is checked after adding; the error undoes the adding (the whole request is one transaction)
        if (before.memberCount + added > MAX_LIST_MEMBERS) {
          throw conflict('LIST_FULL', `A list holds at most ${MAX_LIST_MEMBERS} contacts.`);
        }
        return finishAdding(transaction, { accountId, listId, added, actor });
      });
    },

    /** Takes one person out of a list (the contact itself is not touched). An unknown list, another business's list and a person who is not in the list are 404. */
    async removeMember(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      listId: string,
      contactId: string,
    ): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await contactListsRepository.findContactListById(transaction, accountId, listId)))
          throw notFound('That list');
        if (!(await contactListsRepository.removeMember(transaction, { accountId, listId, contactId }))) {
          throw notFound('That person in the list');
        }
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'lists.member_removed',
          details: { recordType: 'list', recordId: listId, fields: ['members'] },
        });
      });
    },

    /** Deletes a list for good (managers only; the route checks the role). Its people stay as contacts. An unknown list and another business's list are 404. */
    async deleteList(principal: Pick<Principal, 'accountId' | 'userId'>, listId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await contactListsRepository.deleteContactList(transaction, accountId, listId)))
          throw notFound('That list');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'lists.deleted',
          details: { recordType: 'list', recordId: listId, fields: ['name'] },
        });
      });
    },
  };
}

/** Writes the activity line (when anyone was added) and reads the list again for the answer. */
async function finishAdding(
  transaction: Db,
  options: { accountId: string; listId: string; added: number; actor: Actor },
): Promise<AddListMembersResponse> {
  if (options.added > 0) {
    await writeActivityLog(transaction, {
      accountId: options.accountId,
      actor: options.actor,
      kind: 'lists.members_added',
      details: { recordType: 'list', recordId: options.listId, fields: ['members'] },
    });
  }
  const list = await contactListsRepository.findContactListById(transaction, options.accountId, options.listId);
  if (!list) throw notFound('That list');
  return { added: options.added, list: toContactList(list) };
}
