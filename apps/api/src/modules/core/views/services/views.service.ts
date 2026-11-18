import {
  MAX_VIEWS_PER_PERSON,
  leadViewFiltersSchema,
  type CreateViewRequest,
  type ListViewsQuery,
  type SavedView,
  type ViewsListResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import * as savedViewsRepository from '../repositories/saved-views.repository';
import type { SavedViewRow } from '../repositories/saved-views.repository';

// The database error code for "a unique rule was broken".
const UNIQUE_VIOLATION = '23505';

/** Turns a stored view into the SavedView the API answers with. A stored filter that no longer makes sense is left out, so a damaged row never breaks a screen. */
function toSavedView(row: SavedViewRow, userId: string): SavedView {
  const filters = leadViewFiltersSchema.safeParse(row.filters);
  const sortField = row.sortField;
  const isKnownSort =
    sortField === 'lastActivity' || sortField === 'createdAt' || sortField === 'callbackAt' || sortField === 'stage';
  return {
    id: row.id,
    object: row.object,
    name: row.name,
    filters: filters.success ? filters.data : {},
    sort: isKnownSort && row.sortOrder !== null ? { field: sortField, order: row.sortOrder } : null,
    layout: row.layout,
    shared: row.shared,
    isMine: row.ownerUserId === userId,
  };
}

/** Saved views (F11): a named way of looking at a list, found again as a tab. Each person sees their own views and the ones a manager shared. */
export function createViewsService({ database }: { database: Database }) {
  return {
    /** The views of one list that this person may see: their own and the shared ones, oldest first. */
    async listViews(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      query: ListViewsQuery,
    ): Promise<ViewsListResponse> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const rows = await savedViewsRepository.listViewsVisibleTo(transaction, {
          accountId: principal.accountId,
          object: query.object,
          userId: principal.userId,
        });
        return { items: rows.map((row) => toSavedView(row, principal.userId)) };
      });
    },

    /**
     * Saves the list as it is on screen under a name. A person has at most 30 views of one list (409 TOO_MANY_VIEWS) and never two with the same name,
     * whatever the capitals (409 VIEW_NAME_TAKEN). The view is the person's own and not shared.
     */
    async createView(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateViewRequest,
    ): Promise<SavedView> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const saved = await savedViewsRepository.countViewsOwnedBy(transaction, {
            accountId,
            object: request.object,
            userId: principal.userId,
          });
          if (saved >= MAX_VIEWS_PER_PERSON) {
            throw conflict(
              'TOO_MANY_VIEWS',
              `You can save at most ${MAX_VIEWS_PER_PERSON} views of this list. Delete one first.`,
            );
          }
          const row = await savedViewsRepository.insertSavedView(transaction, {
            id: uuidv7(),
            accountId,
            object: request.object,
            name: request.name,
            filters: request.filters,
            sortField: request.sort?.field ?? null,
            sortOrder: request.sort?.order ?? null,
            layout: request.layout,
            ownerUserId: principal.userId,
            actor,
          });
          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'views.created',
            details: { recordType: 'view', recordId: row.id, fields: ['name', 'filters'] },
          });
          return toSavedView(row, principal.userId);
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) {
          throw new ApiError(409, 'VIEW_NAME_TAKEN', 'You already have a view with that name. Choose another name.');
        }
        throw error;
      }
    },
  };
}
