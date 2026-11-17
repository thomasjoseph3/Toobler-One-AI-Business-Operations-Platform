import type { Activity, ActivitiesListResponse, CreateNoteRequest, ListActivitiesQuery } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { findPeopleSummaries } from '../../auth';
import type { PersonSummary } from '../../auth';
import { findContactSummaries } from '../../contacts';
import { findLeadReference } from '../../leads';
import * as activitiesRepository from '../repositories/activities.repository';
import type { ActivityRow } from '../repositories/activities.repository';

/** Turns a database row plus the person who wrote it into the Activity the API answers with. */
function toActivity(row: ActivityRow, writer: PersonSummary | undefined): Activity {
  const isAgent = row.byUserId === null && row.byAgent !== null;
  return {
    id: row.id,
    kind: row.kind,
    contactId: row.contactId,
    leadId: row.leadId,
    body: row.body,
    writtenBy: {
      kind: row.byUserId !== null ? 'user' : isAgent ? 'agent' : 'system',
      userId: row.byUserId,
      name: writer?.name ?? row.byAgent,
      role: writer?.role ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

/** Looks up who wrote each of these activities (one query) and builds the answers. */
async function withWriters(transaction: Db, accountId: string, rows: readonly ActivityRow[]): Promise<Activity[]> {
  const userIds = rows.flatMap((row) => (row.byUserId === null ? [] : [row.byUserId]));
  const people = await findPeopleSummaries(transaction, { accountId, userIds });
  const personById = new Map(people.map((person) => [person.id, person]));
  return rows.map((row) => toActivity(row, row.byUserId === null ? undefined : personById.get(row.byUserId)));
}

/**
 * The activity timeline: notes for now. The "own leads only" role sees only the timelines of its own leads (a person's whole timeline
 * would show other people's leads, so that answers 403 to it).
 */
export function createActivitiesService({ database }: { database: Database }) {
  return {
    /**
     * Adds a note to a lead (or to a person) as the signed-in person. A lead that is not the business's (or not the person's to see), a
     * deleted one and an unknown id answer 404, and so does an unknown contact. A note on a lead also carries the lead's contact, so it
     * shows on that person's timeline. Writes one log line (never the words) and the `note.added` event.
     */
    async createNote(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      request: CreateNoteRequest,
    ): Promise<Activity> {
      if (request.contactId !== undefined && principal.role === 'staff_own') throw forbiddenForOwnLeadsOnly();
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
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
        const row = await activitiesRepository.insertNote(transaction, {
          id: uuidv7(),
          accountId,
          contactId,
          leadId,
          body: request.body,
          byUserId: principal.userId,
          byAgent: null,
          actor,
        });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'activities.note_added',
          // That a note was added, never its words
          details: { recordType: 'activity', recordId: row.id },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'note.added',
          payload: { activityId: row.id, leadId, contactId },
        });
        const [activity] = await withWriters(transaction, accountId, [row]);
        return activity!;
      });
    },

    /**
     * One lead's timeline (`lead_id`) or one person's (`contact_id`, which includes all their leads), newest first. One of the two is
     * needed (400 FILTER_NEEDED), not both. An unknown lead or person answers 404.
     */
    async listActivities(
      principal: Pick<Principal, 'accountId' | 'userId' | 'role'>,
      query: ListActivitiesQuery,
    ): Promise<ActivitiesListResponse> {
      if ((query.lead_id === undefined) === (query.contact_id === undefined)) {
        throw new ApiError(400, 'FILTER_NEEDED', 'Send exactly one of lead_id or contact_id.');
      }
      if (query.contact_id !== undefined && principal.role === 'staff_own') throw forbiddenForOwnLeadsOnly();
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (query.lead_id !== undefined) {
          const lead = await findLeadReference(transaction, {
            accountId,
            leadId: query.lead_id,
            ...(principal.role === 'staff_own' ? { visibleToUserId: principal.userId } : {}),
          });
          if (!lead) throw notFound('That lead');
        } else {
          const [contact] = await findContactSummaries(transaction, { accountId, contactIds: [query.contact_id!] });
          if (!contact) throw notFound('That contact');
        }
        const { items, total } = await activitiesRepository.listActivities(transaction, {
          accountId,
          leadId: query.lead_id,
          contactId: query.contact_id,
          kind: query.kind,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
        });
        return { items: await withWriters(transaction, accountId, items), total, page: query.page, limit: query.limit };
      });
    },
  };
}

/** The refusal for the "own leads only" role asking for something that would show other people's leads. */
function forbiddenForOwnLeadsOnly(): ApiError {
  return new ApiError(403, 'FORBIDDEN', 'You can only use the notes of your own leads.');
}
