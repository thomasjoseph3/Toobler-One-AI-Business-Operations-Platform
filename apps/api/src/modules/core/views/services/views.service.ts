import {
  MAX_VIEWS_PER_PERSON,
  leadViewFiltersSchema,
  type CreateViewRequest,
  type ListViewsQuery,
  type UpdateViewRequest,
  type SavedView,
  type ViewsListResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, forbidden, notFound } from '../../../../kernel/errors';
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

/** The database error code for "a unique rule was broken", as an error check. */
const isUniqueViolation = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION;

/** True when this person may change or delete the view: it is theirs, or it is shared and they are a manager (who looks after what the whole team sees). */
function mayChange(view: SavedViewRow, principal: Pick<Principal, 'userId' | 'role'>): boolean {
  return view.ownerUserId === principal.userId || (view.shared && principal.role === 'manager');
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
        if (isUniqueViolation(error)) {
          throw new ApiError(409, 'VIEW_NAME_TAKEN', 'You already have a view with that name. Choose another name.');
        }
        throw error;
      }
    },

    /**
     * Changes a view: its name, what it filters, sorts and shows, and whether it is shared with the team (managers only, 403 for anyone else).
     * The owner changes their own views; a manager can also change a shared view of anyone. A view the person cannot see (another person's, not shared)
     * and an unknown or another business's id are 404; a shared view of a colleague that the person may not change is 403. 400 NOTHING_TO_CHANGE
     * when nothing is sent. Sending what the view already has changes nothing and writes no log line.
     */
    async updateView(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      viewId: string,
      request: UpdateViewRequest,
    ): Promise<SavedView> {
      if (Object.values(request).every((value) => value === undefined)) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one thing to change.');
      }
      if (request.shared !== undefined && principal.role !== 'manager') {
        throw forbidden('Only a manager can share a view with the team.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const current = await savedViewsRepository.findSavedViewById(transaction, accountId, viewId);
          if (!current || (current.ownerUserId !== principal.userId && !current.shared)) throw notFound('That view');
          if (!mayChange(current, principal)) throw forbidden('You cannot change a view that someone else shared.');
          // A manager who is not the owner may only share or stop sharing a shared view: its name and filters are its owner's
          const ownerOnly =
            request.name !== undefined ||
            request.filters !== undefined ||
            request.sort !== undefined ||
            request.layout !== undefined;
          if (ownerOnly && current.ownerUserId !== principal.userId) {
            throw forbidden('Only the person who saved a view can change what it shows.');
          }

          const updated = await savedViewsRepository.updateSavedView(transaction, {
            accountId,
            viewId,
            changes: {
              ...(request.name !== undefined ? { name: request.name } : {}),
              ...(request.shared !== undefined ? { shared: request.shared } : {}),
              ...(request.filters !== undefined ? { filters: request.filters } : {}),
              ...(request.sort !== undefined
                ? { sortField: request.sort?.field ?? null, sortOrder: request.sort?.order ?? null }
                : {}),
              ...(request.layout !== undefined ? { layout: request.layout } : {}),
            },
            actor,
          });
          if (!updated) throw notFound('That view');
          const changedFields = [
            ...(request.name !== undefined && request.name !== current.name ? ['name'] : []),
            ...(request.shared !== undefined && request.shared !== current.shared ? ['shared'] : []),
            ...(request.filters !== undefined || request.sort !== undefined || request.layout !== undefined
              ? ['filters']
              : []),
          ];
          if (changedFields.length > 0) {
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'views.updated',
              details: { recordType: 'view', recordId: viewId, fields: changedFields },
            });
          }
          return toSavedView(updated, principal.userId);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ApiError(409, 'VIEW_NAME_TAKEN', 'You already have a view with that name. Choose another name.');
        }
        throw error;
      }
    },

    /** Deletes a view for good. The owner deletes their own; a manager can also delete a shared view of anyone. Same 404 and 403 rules as changing one. */
    async deleteView(principal: Pick<Principal, 'accountId' | 'userId' | 'role'>, viewId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await savedViewsRepository.findSavedViewById(transaction, accountId, viewId);
        if (!current || (current.ownerUserId !== principal.userId && !current.shared)) throw notFound('That view');
        if (!mayChange(current, principal)) throw forbidden('You cannot delete a view that someone else shared.');
        if (!(await savedViewsRepository.deleteSavedView(transaction, accountId, viewId))) throw notFound('That view');
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'views.deleted',
          details: { recordType: 'view', recordId: viewId, fields: ['name'] },
        });
      });
    },
  };
}
