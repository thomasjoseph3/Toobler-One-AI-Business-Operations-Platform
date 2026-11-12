import type {
  BoardColumn,
  CreateLeadRequest,
  Lead,
  LeadsBoardResponse,
  LeadsListResponse,
  ListLeadsQuery,
  UpdateLeadRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { applyLeadFactsToContact, findContactSummaries } from '../../contacts';
import type { ContactSummary } from '../../contacts';
import { decideWhatToDoWithEnquiry } from '../helpers/open-lead-rule';
import * as assignmentRulesRepository from '../repositories/assignment-rules.repository';
import * as leadsRepository from '../repositories/leads.repository';
import type { LeadDetailChanges, LeadRow } from '../repositories/leads.repository';
import * as pipelineRepository from '../repositories/pipeline.repository';

// The database error codes for "a unique rule was broken" and "a foreign key points at nothing".
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** The most leads one board column carries; the column says how many more there are. */
const BOARD_COLUMN_LIMIT = 50;

/** True when the error is the database saying the given kind of rule was broken. */
const isDatabaseError = (error: unknown, code: string) =>
  error instanceof Error && 'code' in error && error.code === code;

/** Turns a database row plus the person it is for into the Lead the API answers with. */
function toLead(row: LeadRow, contactsById: Map<string, ContactSummary>): Lead {
  return {
    id: row.id,
    contactId: row.contactId,
    contact: contactsById.get(row.contactId) ?? null,
    stage: { id: row.stageId, name: row.stageName, kind: row.stageKind },
    temperature: row.temperature,
    interest: row.interest,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    partySize: row.partySize,
    budgetPaise: row.budgetPaise,
    promise: row.promise,
    callbackAt: row.callbackAt?.toISOString() ?? null,
    ownerUserId: row.ownerUserId,
    firstChannel: row.firstChannel,
    lastActivityAt: row.lastActivityAt.toISOString(),
    lostReason: row.lostReason,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Looks up the people the given leads are for, keyed by contact id. */
async function loadContactsForLeads(transaction: Db, accountId: string, rows: LeadRow[]) {
  const contactIds = [...new Set(rows.map((row) => row.contactId))];
  const summaries = await findContactSummaries(transaction, { accountId, contactIds });
  return new Map(summaries.map((summary) => [summary.id, summary]));
}

/**
 * Everything about a business's leads. The routes call this.
 * Repositories used: leads, pipeline, assignment-rules (in ../repositories). Reaches contacts only through contacts/index.ts.
 */
export function createLeadsService({ database }: { database: Database }) {
  /** The lead as the API shows it, read fresh from the database. */
  async function readLead(transaction: Db, accountId: string, leadId: string): Promise<Lead> {
    const row = await leadsRepository.findLeadById(transaction, accountId, leadId);
    if (!row) throw new Error('The lead that was just saved cannot be read');
    return toLead(row, await loadContactsForLeads(transaction, accountId, [row]));
  }

  return {
    /**
     * Adds a lead by hand for a contact. It starts in the first open stage with the channel `manual`. The owner is the one
     * named, or else the person the business's sharing-out rule picks. Refused with 409: the contact already has an open lead
     * (LEAD_OPEN) or had one lost less than 60 days ago, which should be reopened instead (LEAD_RECENTLY_LOST); both name
     * the lead. A contact that is missing, deleted or another business's, and an owner from another business, answer 404.
     * The contact's lifecycle stage is updated. Two requests at the same moment cannot give one contact two open leads.
     */
    async createLead(principal: Pick<Principal, 'accountId' | 'userId'>, request: CreateLeadRequest): Promise<Lead> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const contacts = await findContactSummaries(transaction, { accountId, contactIds: [request.contactId] });
          if (contacts.length === 0) throw notFound('That contact');

          // Rule R6: does this person already have a lead that should take this enquiry?
          const latestLead = await leadsRepository.findLatestLeadForContact(transaction, accountId, request.contactId);
          const decision = decideWhatToDoWithEnquiry({
            latestLead: latestLead ? { stageKind: latestLead.stageKind, closedAt: latestLead.closedAt } : undefined,
            now: new Date(),
          });
          if (latestLead && decision === 'attach_to_open_lead') {
            throw conflict('LEAD_OPEN', 'This person already has an open lead.', { leadId: latestLead.id });
          }
          if (latestLead && decision === 'reopen_lost_lead') {
            throw conflict(
              'LEAD_RECENTLY_LOST',
              'This person had a lead lost less than 60 days ago. Reopen that lead instead.',
              { leadId: latestLead.id },
            );
          }
          // 'decide_by_conversation_type' (a recent win) is a new purchase when staff add a lead by hand, so go on.

          const pipeline = await pipelineRepository.findPipelineForAccount(transaction, accountId);
          const firstOpenStage = pipeline
            ? await pipelineRepository.findFirstOpenStage(transaction, accountId, pipeline.id)
            : undefined;
          if (!firstOpenStage) throw new Error('The business has no open pipeline stage');

          // Round-robin arrives in a later slice; until a business can choose it, "one person" is the only rule.
          const assignmentRule = await assignmentRulesRepository.findAssignmentRule(transaction, accountId);
          const ownerUserId =
            request.ownerUserId ?? (assignmentRule?.mode === 'one_person' ? assignmentRule.userId : null);

          const leadId = uuidv7();
          await leadsRepository.insertLead(transaction, {
            id: leadId,
            accountId,
            contactId: request.contactId,
            stageId: firstOpenStage.id,
            interest: request.interest ?? null,
            dateFrom: request.dateFrom ?? null,
            dateTo: request.dateTo ?? null,
            partySize: request.partySize ?? null,
            budgetPaise: request.budgetPaise ?? null,
            promise: request.promise ?? null,
            callbackAt: request.callbackAt ? new Date(request.callbackAt) : null,
            ownerUserId,
            actor,
          });

          const leadFacts = await leadsRepository.countOpenAndWonLeadsForContact(
            transaction,
            accountId,
            request.contactId,
          );
          await applyLeadFactsToContact(transaction, {
            accountId,
            contactId: request.contactId,
            openLeads: leadFacts.openLeads,
            wonLeads: leadFacts.wonLeads,
            actor,
          });

          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'leads.created',
            // Which fields were filled in, never their values
            details: {
              recordType: 'lead',
              recordId: leadId,
              fields: Object.keys(request).filter((field) => request[field as keyof CreateLeadRequest] !== undefined),
            },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'lead.created',
            payload: { leadId, contactId: request.contactId, ownerUserId },
          });
          return readLead(transaction, accountId, leadId);
        });
      } catch (error) {
        // The owner is not a person of this business (the database checks the business): answer like any unknown id
        if (isDatabaseError(error, FOREIGN_KEY_VIOLATION)) throw notFound('That person');
        if (!isDatabaseError(error, UNIQUE_VIOLATION)) throw error;
        // Someone added a lead for the same contact a moment ago. The failed transaction is gone, so look in a new one.
        const existingLead = await database.runInAccountTransaction(accountId, (transaction) =>
          leadsRepository.findLatestLeadForContact(transaction, accountId, request.contactId),
        );
        if (existingLead)
          throw conflict('LEAD_OPEN', 'This person already has an open lead.', { leadId: existingLead.id });
        throw error;
      }
    },

    /** One lead of the business. A deleted lead, an unknown id and another business's lead all answer 404. */
    async getLead(principal: Pick<Principal, 'accountId'>, leadId: string): Promise<Lead> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const row = await leadsRepository.findLeadById(transaction, principal.accountId, leadId);
        if (!row) throw notFound('That lead');
        return toLead(row, await loadContactsForLeads(transaction, principal.accountId, [row]));
      });
    },

    /**
     * Changes the details that were sent (interest, dates, party size, budget, promise, callback) and answers with the lead.
     * Sending what is already stored changes nothing (no log line, no event). The end date may not be before the start date,
     * judged against what the lead will hold after the change (400 INVALID_DATES). The stage and owner have their own
     * routes. "Last activity" does not move: editing is not contact with the customer.
     */
    async updateLead(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      leadId: string,
      request: UpdateLeadRequest,
    ): Promise<Lead> {
      if (Object.values(request).every((value) => value === undefined)) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one field to change.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (!(await leadsRepository.lockLeadForUpdate(transaction, accountId, leadId))) throw notFound('That lead');
        const current = await leadsRepository.findLeadById(transaction, accountId, leadId);
        if (!current) throw notFound('That lead');

        // What the lead would look like: a field not sent stays as it is, `null` clears it
        const changes: LeadDetailChanges = {};
        if (request.interest !== undefined && request.interest !== current.interest)
          changes.interest = request.interest;
        if (request.dateFrom !== undefined && request.dateFrom !== current.dateFrom)
          changes.dateFrom = request.dateFrom;
        if (request.dateTo !== undefined && request.dateTo !== current.dateTo) changes.dateTo = request.dateTo;
        if (request.partySize !== undefined && request.partySize !== current.partySize) {
          changes.partySize = request.partySize;
        }
        if (request.budgetPaise !== undefined && request.budgetPaise !== current.budgetPaise) {
          changes.budgetPaise = request.budgetPaise;
        }
        if (request.promise !== undefined && request.promise !== current.promise) changes.promise = request.promise;
        if (request.callbackAt !== undefined) {
          const newCallbackAt = request.callbackAt === null ? null : new Date(request.callbackAt);
          if (newCallbackAt?.getTime() !== current.callbackAt?.getTime()) changes.callbackAt = newCallbackAt;
        }
        const changedFields = Object.keys(changes); // the names of the fields that really change
        if (changedFields.length === 0)
          return toLead(current, await loadContactsForLeads(transaction, accountId, [current]));

        const dateFromAfter = 'dateFrom' in changes ? changes.dateFrom : current.dateFrom;
        const dateToAfter = 'dateTo' in changes ? changes.dateTo : current.dateTo;
        if (dateFromAfter && dateToAfter && dateToAfter < dateFromAfter) {
          throw new ApiError(400, 'INVALID_DATES', 'The end date cannot be before the start date.');
        }

        await leadsRepository.updateLeadDetails(transaction, { accountId, leadId, changes, actor });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'leads.updated',
          // Which fields changed, never their values
          details: { recordType: 'lead', recordId: leadId, fields: changedFields },
        });
        await publishEvent(transaction, {
          accountId,
          eventName: 'lead.updated',
          payload: { leadId, fields: changedFields },
        });
        return readLead(transaction, accountId, leadId);
      });
    },

    /** The leads as a list (one page, newest activity first) or as a board (a column per stage), narrowed by the filters. */
    async listLeads(
      principal: Pick<Principal, 'accountId'>,
      query: ListLeadsQuery,
    ): Promise<LeadsListResponse | LeadsBoardResponse> {
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        if (query.view === 'board') {
          return readBoard(transaction, accountId, query);
        }
        const { rows, total } = await leadsRepository.listLeadRows(
          transaction,
          {
            accountId,
            stageId: query.stageId,
            ownerUserId: query.ownerUserId,
            contactId: query.contactId,
            status: query.status,
          },
          { limit: query.limit, offset: (query.page - 1) * query.limit },
        );
        const contactsById = await loadContactsForLeads(transaction, accountId, rows);
        return {
          view: 'list' as const,
          items: rows.map((row) => toLead(row, contactsById)),
          total,
          page: query.page,
          limit: query.limit,
        };
      });
    },
  };
}

/** The board: every stage in order, each with its newest leads (the owner and contact filters apply, the others do not). */
async function readBoard(transaction: Db, accountId: string, query: ListLeadsQuery): Promise<LeadsBoardResponse> {
  const pipeline = await pipelineRepository.findPipelineForAccount(transaction, accountId);
  if (!pipeline) throw notFound('The pipeline');
  const stages = await pipelineRepository.listStagesInOrder(transaction, accountId, pipeline.id);

  const columnsWithRows: Array<{ stage: (typeof stages)[number]; rows: LeadRow[]; total: number }> = [];
  for (const stage of stages) {
    const { rows, total } = await leadsRepository.listLeadRows(
      transaction,
      { accountId, stageId: stage.id, ownerUserId: query.ownerUserId, contactId: query.contactId },
      { limit: BOARD_COLUMN_LIMIT, offset: 0 },
    );
    columnsWithRows.push({ stage, rows, total });
  }

  const contactsById = await loadContactsForLeads(
    transaction,
    accountId,
    columnsWithRows.flatMap((column) => column.rows),
  );
  const columns: BoardColumn[] = columnsWithRows.map((column) => ({
    stage: column.stage,
    leadCount: column.total,
    leads: column.rows.map((row) => toLead(row, contactsById)),
    hasMore: column.total > column.rows.length,
  }));
  return { view: 'board', columns };
}

export type LeadsService = ReturnType<typeof createLeadsService>;
