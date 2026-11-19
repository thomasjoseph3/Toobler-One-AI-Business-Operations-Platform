import type { TodayLeadItem, TodayQuery, TodayResponse, TodayScope, TodayTaskItem } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { findBusinessIdentity, findPeopleSummaries } from '../../auth';
import type { PersonSummary } from '../../auth';
import { findContactSummaries } from '../../contacts';
import type { ContactSummary } from '../../contacts';
import { findFirstTouchTimesForLeads } from '../../activities';
import { findLeadsForToday } from '../../leads';
import type { LeadForTodayRow } from '../../leads';
import { findOpenTasksForToday } from '../../tasks';
import type { OpenTaskRow } from '../../tasks';
import { createSetupService } from '../../setup';
import { buildTodaySections, type LeadForToday, type TaskForToday, type TodayBounds } from '../helpers/today-sections';
import {
  DEFAULT_CLOSING_HOUR,
  lastClosingTimeInZone,
  startOfNextDayInZone,
  startOfWeekInZone,
} from '../helpers/today-bounds';

/** What the Today route gives the service: who is asking (business, person, role, industry) and the scope they want. */
type TodayPrincipal = Pick<Principal, 'accountId' | 'userId' | 'role' | 'industryId'>;

/** The refusal for the "own leads only" role asking to see the whole team's work. */
function forbiddenForOwnLeadsOnly(): ApiError {
  return new ApiError(403, 'FORBIDDEN', 'You can only see your own Today page, not the team’s.');
}

/** Turns a lead the database gave us, plus when it was first touched, into the shape the pure section logic needs. */
function toLeadForToday(lead: LeadForTodayRow, firstTouchByLead: Map<string, Date>): LeadForToday {
  return {
    id: lead.id,
    contactId: lead.contactId,
    ownerUserId: lead.ownerUserId,
    temperature: lead.temperature,
    stageKind: lead.stageKind,
    createdAt: lead.createdAt,
    callbackAt: lead.callbackAt,
    closedAt: lead.closedAt,
    contactedAt: firstTouchByLead.get(lead.id) ?? null,
  };
}

/** Turns an open task the database gave us into the shape the pure section logic needs. */
function toTaskForToday(task: OpenTaskRow): TaskForToday {
  return { id: task.id, ownerUserId: task.ownerUserId, dueAt: task.dueAt, doneAt: task.doneAt };
}

/**
 * The Today page (F22): the first screen staff see — "who do I call next?". One read endpoint builds every section in
 * code from the caller's leads and tasks. The "own leads only" role sees only its own and may not ask for the team.
 */
export function createTodayService({ database }: { database: Database }) {
  const setupService = createSetupService({ database });

  /** Attaches each item's contact (name + phone), the owner's name for the team view, and the manager setup nudge. */
  async function enrich(
    principal: TodayPrincipal,
    built: ReturnType<typeof buildTodaySections>,
    leadRows: readonly LeadForTodayRow[],
    taskRows: readonly OpenTaskRow[],
    scope: TodayScope,
  ): Promise<TodayResponse> {
    const leadById = new Map(leadRows.map((lead) => [lead.id, lead]));
    const taskById = new Map(taskRows.map((task) => [task.id, task]));

    // Every contact and owner named anywhere on the page, so each is looked up once.
    const contactIds = new Set<string>();
    const ownerIds = new Set<string>();
    const leadItems = [...built.late.leads, ...built.hot, ...built.overnight];
    for (const item of leadItems) {
      contactIds.add(item.contactId);
      const owner = leadById.get(item.leadId)?.ownerUserId;
      if (owner) ownerIds.add(owner);
    }
    const taskItems = [...built.late.tasks, ...built.dueToday];
    for (const item of taskItems) {
      const task = taskById.get(item.taskId);
      if (task) {
        contactIds.add(task.contactId);
        ownerIds.add(task.ownerUserId);
      }
    }

    const { contactById, ownerById, setupChecklist } = await database.runInAccountTransaction(
      principal.accountId,
      async (transaction) => {
        const contacts = await findContactSummaries(transaction, {
          accountId: principal.accountId,
          contactIds: [...contactIds],
        });
        const owners =
          scope === 'team'
            ? await findPeopleSummaries(transaction, { accountId: principal.accountId, userIds: [...ownerIds] })
            : [];
        return {
          contactById: new Map(contacts.map((contact) => [contact.id, contact])),
          ownerById: new Map(owners.map((owner) => [owner.id, owner])),
          // The setup nudge is a manager's: staff do not see it.
          setupChecklist:
            principal.role === 'manager'
              ? { unfinishedSteps: await setupService.countUnfinishedSteps(principal) }
              : null,
        };
      },
    );

    const ownerNameFor = (userId: string | null): string | null =>
      scope === 'team' && userId ? (ownerById.get(userId)?.name ?? null) : null;
    const toLeadItem = (item: (typeof leadItems)[number]): TodayLeadItem => {
      const lead = leadById.get(item.leadId);
      const contact: ContactSummary | undefined = contactById.get(item.contactId);
      return {
        leadId: item.leadId,
        contactId: item.contactId,
        contactName: contact?.name ?? null,
        phone: contact?.phone ?? null,
        temperature: item.temperature,
        interest: lead?.interest ?? null,
        reason: item.reason,
        ownerName: ownerNameFor(lead?.ownerUserId ?? null),
      };
    };
    const toTaskItem = (item: (typeof taskItems)[number]): TodayTaskItem => {
      const task = taskById.get(item.taskId)!;
      const contact: ContactSummary | undefined = contactById.get(task.contactId);
      const person: PersonSummary | undefined = ownerById.get(task.ownerUserId);
      return {
        taskId: task.id,
        title: task.title,
        kind: task.kind,
        dueAt: task.dueAt.toISOString(),
        contactId: task.contactId,
        contactName: contact?.name ?? null,
        phone: contact?.phone ?? null,
        leadId: task.leadId,
        ownerName: scope === 'team' ? (person?.name ?? null) : null,
      };
    };

    return {
      scope,
      sections: {
        late: { leads: built.late.leads.map(toLeadItem), tasks: built.late.tasks.map(toTaskItem) },
        hot: built.hot.map(toLeadItem),
        dueToday: built.dueToday.map(toTaskItem),
        overnight: built.overnight.map(toLeadItem),
        thisWeek: built.thisWeek,
      },
      setupChecklist,
    };
  }

  return {
    /**
     * Builds the whole Today page for the signed-in person: the five sections (Late, Hot, Due today, Overnight, This
     * week), each lead with its contact, phone and what they want, and — for a manager — how many setup steps are left.
     * `scope=me` is their own work; `scope=team` is everyone's. The own-leads-only role is held to its own (403 on team).
     */
    async getToday(principal: TodayPrincipal, query: TodayQuery): Promise<TodayResponse> {
      const isOwnLeadsOnly = principal.role === 'staff_own';
      if (isOwnLeadsOnly && query.scope === 'team') throw forbiddenForOwnLeadsOnly();
      const scope: TodayScope = isOwnLeadsOnly ? 'me' : query.scope;
      // "me" narrows leads and tasks to the signed-in person; "team" leaves them for every owner in the business.
      const ownerUserId = scope === 'me' ? principal.userId : undefined;

      const { built, leadRows, taskRows } = await database.runInAccountTransaction(
        principal.accountId,
        async (transaction) => {
          const now = new Date();
          const identity = await findBusinessIdentity(transaction, principal.accountId);
          const timeZone = identity?.timeZone ?? 'UTC';
          const bounds: TodayBounds = {
            now,
            startOfTomorrow: startOfNextDayInZone(now, timeZone),
            startOfWeek: startOfWeekInZone(now, timeZone),
            lastClosingTime: lastClosingTimeInZone(now, timeZone, DEFAULT_CLOSING_HOUR),
          };

          const leads = await findLeadsForToday(transaction, {
            accountId: principal.accountId,
            ownerUserId,
            sinceWeekStart: bounds.startOfWeek,
          });
          const firstTouchByLead = await findFirstTouchTimesForLeads(transaction, {
            accountId: principal.accountId,
            leadIds: leads.map((lead) => lead.id),
          });
          const tasks = await findOpenTasksForToday(transaction, { accountId: principal.accountId, ownerUserId });

          return {
            built: buildTodaySections(
              leads.map((lead) => toLeadForToday(lead, firstTouchByLead)),
              tasks.map(toTaskForToday),
              bounds,
            ),
            leadRows: leads,
            taskRows: tasks,
          };
        },
      );

      return enrich(principal, built, leadRows, taskRows, scope);
    },
  };
}
