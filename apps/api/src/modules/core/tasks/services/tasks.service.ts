import type {
  CreateTaskRequest,
  ListTasksQuery,
  NextDueResponse,
  Task,
  TasksListResponse,
  UpdateTaskRequest,
} from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import { publishEvent } from '../../../../kernel/events/publish';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Principal } from '../../../../kernel/http/guard';
import { findBusinessIdentity, findPeopleSummaries } from '../../auth';
import type { PersonSummary } from '../../auth';
import { findContactSummaries } from '../../contacts';
import type { ContactSummary } from '../../contacts';
import { findLeadReference, findVisibleLeadIds } from '../../leads';
import { bucketOfTask, startOfNextDayInZone } from '../helpers/day-bounds';
import * as tasksRepository from '../repositories/tasks.repository';
import type { TaskRow } from '../repositories/tasks.repository';

/** The refusal for the "own leads only" role asking for something that would show other people's work. */
function forbiddenForOwnLeadsOnly(): ApiError {
  return new ApiError(403, 'FORBIDDEN', 'You can only use your own tasks and the tasks of your own leads.');
}

/** Builds the Task the API answers with from a row, the person it is about, its owner, and the tab it is in right now. */
function toTask(
  row: TaskRow,
  contact: ContactSummary | undefined,
  owner: PersonSummary | undefined,
  now: Date,
  startOfTomorrow: Date,
): Task {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    bucket: bucketOfTask(row, now, startOfTomorrow),
    doneAt: row.doneAt?.toISOString() ?? null,
    contact: { id: row.contactId, name: contact?.name ?? null },
    leadId: row.leadId,
    owner: { userId: row.ownerUserId, name: owner?.name ?? null },
    createdByAgent: row.createdByAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Looks up the person and the owner of each task (two queries in all) and builds the answers. */
async function withPeople(
  transaction: Db,
  accountId: string,
  rows: readonly TaskRow[],
  now: Date,
  startOfTomorrow: Date,
): Promise<Task[]> {
  const contacts = await findContactSummaries(transaction, {
    accountId,
    contactIds: [...new Set(rows.map((row) => row.contactId))],
  });
  const owners = await findPeopleSummaries(transaction, {
    accountId,
    userIds: [...new Set(rows.map((row) => row.ownerUserId))],
  });
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  return rows.map((row) =>
    toTask(row, contactById.get(row.contactId), ownerById.get(row.ownerUserId), now, startOfTomorrow),
  );
}

/** Where tomorrow starts for the business (its own time zone), so "today" means the business's day. */
async function findStartOfTomorrow(transaction: Db, accountId: string, now: Date): Promise<Date> {
  const identity = await findBusinessIdentity(transaction, accountId);
  return startOfNextDayInZone(now, identity?.timeZone ?? 'UTC');
}

/**
 * Tasks (F08): a to-do with an owner and a due time, about a person and usually one of their leads. The "own leads only" role adds tasks
 * only on its own leads, for itself, and sees only the tasks it owns.
 */
export function createTasksService({ database }: { database: Database }) {
  return {
    /**
     * Adds a task as the signed-in person. The owner is the signed-in person unless another person of the business is named (an unknown
     * person answers 404; the "own leads only" role may only name itself: 403). A lead or person that is not the business's, a deleted one
     * and an unknown id answer 404. Writes one log line (never the title) and the `task.created` event.
     */
    async createTask(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      request: CreateTaskRequest,
    ): Promise<Task> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const ownerUserId = request.ownerUserId ?? principal.userId;
      if (principal.role === 'staff_own') {
        if (request.contactId !== undefined || ownerUserId !== principal.userId) throw forbiddenForOwnLeadsOnly();
      }
      return database.runInAccountTransaction(accountId, async (transaction) => {
        let leadId: string | null = null;
        let contactId: string;
        if (request.leadId !== undefined) {
          const lead = await findLeadReference(transaction, {
            accountId,
            leadId: request.leadId,
            ...(principal.role === 'staff_own' ? { visibleToUserId: principal.userId } : {}),
          });
          if (!lead) throw notFound('That lead');
          leadId = lead.id;
          contactId = lead.contactId;
        } else {
          const [contact] = await findContactSummaries(transaction, { accountId, contactIds: [request.contactId!] });
          if (!contact) throw notFound('That contact');
          contactId = contact.id;
        }
        const [owner] = await findPeopleSummaries(transaction, { accountId, userIds: [ownerUserId] });
        if (!owner) throw notFound('That person');

        const row = await tasksRepository.insertTask(transaction, {
          id: uuidv7(),
          accountId,
          contactId,
          leadId,
          kind: request.kind,
          title: request.title,
          dueAt: new Date(request.dueAt),
          ownerUserId,
          createdByAgent: null,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'tasks.created',
          // That a task was added, never its words
          details: { recordType: 'task', recordId: row.id },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'task.created',
          // `createdBy` lets the timeline say who added the task
          payload: {
            taskId: row.id,
            leadId,
            contactId,
            ownerUserId,
            kind: row.kind,
            createdBy: { kind: actor.kind, id: actor.id },
          },
        });
        const now = new Date();
        const [task] = await withPeople(
          transaction,
          accountId,
          [row],
          now,
          await findStartOfTomorrow(transaction, accountId, now),
        );
        return task!;
      });
    },

    /**
     * The tasks of the business, one tab at a time (`due`; nothing means every open task), soonest first, with the number each tab holds.
     * `owner=me` or a person's id narrows to one person's tasks; `lead_id` / `contact_id` to one lead or one person (a person's includes
     * all their leads). The "own leads only" role always gets only the tasks it owns, and may not ask for a whole person.
     */
    /**
     * For each asked-about lead, when its earliest open task is due (null when it has none): the date in the "Next activity" column of the Leads list.
     * The "own leads only" role gets a date only for the leads it owns; any other lead answers null, so asking tells nothing. Done and deleted tasks do not count.
     */
    async getNextDueDates(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      leadIds: string[],
    ): Promise<NextDueResponse> {
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const visibleLeadIds = await findVisibleLeadIds(transaction, {
          accountId,
          leadIds,
          ...(principal.role === 'staff_own' ? { visibleToUserId: principal.userId } : {}),
        });
        const earliestByLead = await tasksRepository.findEarliestOpenDueByLead(transaction, accountId, visibleLeadIds);
        return {
          dates: Object.fromEntries(
            leadIds.map((leadId) => [leadId, earliestByLead.get(leadId)?.toISOString() ?? null]),
          ),
        };
      });
    },

    async listTasks(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      query: ListTasksQuery,
    ): Promise<TasksListResponse> {
      if (query.lead_id !== undefined && query.contact_id !== undefined) {
        throw new ApiError(400, 'FILTER_NEEDED', 'Send at most one of lead_id or contact_id.');
      }
      const isOwnLeadsOnly = principal.role === 'staff_own';
      if (isOwnLeadsOnly && query.contact_id !== undefined) throw forbiddenForOwnLeadsOnly();
      const accountId = principal.accountId;
      const ownerUserId = isOwnLeadsOnly || query.owner === 'me' ? principal.userId : query.owner;
      // The "own leads only" role asking for someone else's tasks is told no, not given an empty list
      if (isOwnLeadsOnly && query.owner !== undefined && query.owner !== 'me' && query.owner !== principal.userId) {
        throw forbiddenForOwnLeadsOnly();
      }
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (query.lead_id !== undefined) {
          const lead = await findLeadReference(transaction, {
            accountId,
            leadId: query.lead_id,
            ...(isOwnLeadsOnly ? { visibleToUserId: principal.userId } : {}),
          });
          if (!lead) throw notFound('That lead');
        } else if (query.contact_id !== undefined) {
          const [contact] = await findContactSummaries(transaction, { accountId, contactIds: [query.contact_id] });
          if (!contact) throw notFound('That contact');
        }
        const now = new Date();
        const startOfTomorrow = await findStartOfTomorrow(transaction, accountId, now);
        const { items, total, counts } = await tasksRepository.listTasks(transaction, {
          accountId,
          ownerUserId,
          leadId: query.lead_id,
          contactId: query.contact_id,
          bucket: query.due,
          now,
          startOfTomorrow,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        });
        return {
          items: await withPeople(transaction, accountId, items, now, startOfTomorrow),
          total,
          page: query.page,
          limit: query.limit,
          counts,
        };
      });
    },

    /**
     * Changes a task: its words, kind, due time (this is how a task is snoozed; the reminder and late alert then fire again for the new
     * time), done or open again, or its owner (hands it to another person of the business: an unknown person answers 404). The "own
     * leads only" role can change only tasks it owns (another's answer 404) and cannot hand a task to anyone else (403). An unknown,
     * deleted or another business's task answers 404. Sending what the task already has changes nothing and writes nothing. Writes one
     * log line (which fields, never the words) and the events `task.updated`, plus `task.completed`, `task.reopened` or
     * `task.reassigned` when those happened.
     */
    async updateTask(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      taskId: string,
      request: UpdateTaskRequest,
    ): Promise<Task> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const isOwnLeadsOnly = principal.role === 'staff_own';
      if (isOwnLeadsOnly && request.ownerUserId !== undefined && request.ownerUserId !== principal.userId) {
        throw forbiddenForOwnLeadsOnly();
      }
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await tasksRepository.lockTaskForChange(transaction, accountId, taskId);
        // A task that belongs to someone else looks like an unknown one to the "own leads only" role
        if (!current || (isOwnLeadsOnly && current.ownerUserId !== principal.userId)) throw notFound('That task');
        if (request.ownerUserId !== undefined && request.ownerUserId !== current.ownerUserId) {
          const [newOwner] = await findPeopleSummaries(transaction, { accountId, userIds: [request.ownerUserId] });
          if (!newOwner) throw notFound('That person');
        }

        // Work out what really changes: asking for what the task already has is not a change
        const changes: Parameters<typeof tasksRepository.updateTask>[1]['changes'] = {};
        const changedFields: string[] = [];
        if (request.title !== undefined && request.title !== current.title) {
          changes.title = request.title;
          changedFields.push('title');
        }
        if (request.kind !== undefined && request.kind !== current.kind) {
          changes.kind = request.kind;
          changedFields.push('kind');
        }
        if (request.dueAt !== undefined && new Date(request.dueAt).getTime() !== current.dueAt.getTime()) {
          changes.dueAt = new Date(request.dueAt);
          changedFields.push('dueAt');
        }
        const wasDone = current.doneAt !== null;
        if (request.done !== undefined && request.done !== wasDone) {
          changes.doneAt = request.done ? new Date() : null;
          changedFields.push('done');
        }
        if (request.ownerUserId !== undefined && request.ownerUserId !== current.ownerUserId) {
          changes.ownerUserId = request.ownerUserId;
          changedFields.push('ownerUserId');
        }

        const now = new Date();
        const startOfTomorrow = await findStartOfTomorrow(transaction, accountId, now);
        if (changedFields.length === 0) {
          const [unchanged] = await withPeople(
            transaction,
            accountId,
            [{ ...current, createdByAgent: null, createdAt: now }],
            now,
            startOfTomorrow,
          );
          return unchanged!;
        }
        const row = await tasksRepository.updateTask(transaction, { accountId, taskId, changes, actor });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'tasks.updated',
          // Which fields changed, never their values
          details: { recordType: 'task', recordId: taskId, fields: changedFields },
        });
        const eventPayload = {
          taskId,
          leadId: row.leadId,
          contactId: row.contactId,
          by: { kind: actor.kind, id: actor.id },
        };
        await publishEvent(transaction, {
          accountId,
          eventName: 'task.updated',
          payload: { ...eventPayload, fields: changedFields },
        });
        if (changedFields.includes('done')) {
          await publishEvent(transaction, {
            accountId,
            eventName: row.doneAt !== null ? 'task.completed' : 'task.reopened',
            payload: eventPayload,
          });
        }
        if (changedFields.includes('ownerUserId')) {
          await publishEvent(transaction, {
            accountId,
            eventName: 'task.reassigned',
            payload: { ...eventPayload, fromUserId: current.ownerUserId, toUserId: row.ownerUserId },
          });
        }
        const [task] = await withPeople(transaction, accountId, [row], now, startOfTomorrow);
        return task!;
      });
    },

    /**
     * Deletes a task the soft way: it leaves every list, its row is kept. The "own leads only" role can delete only tasks it owns
     * (another's answer 404). An unknown, already deleted or another business's task answers 404. Writes one log line and `task.deleted`.
     */
    async deleteTask(principal: Pick<Principal, 'accountId' | 'userId' | 'role'>, taskId: string): Promise<void> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const current = await tasksRepository.lockTaskForChange(transaction, accountId, taskId);
        if (!current || (principal.role === 'staff_own' && current.ownerUserId !== principal.userId)) {
          throw notFound('That task');
        }
        await tasksRepository.softDeleteTask(transaction, { accountId, taskId, actor });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'tasks.deleted',
          details: { recordType: 'task', recordId: taskId },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'task.deleted',
          payload: { taskId, leadId: current.leadId, contactId: current.contactId },
        });
      });
    },
  };
}
