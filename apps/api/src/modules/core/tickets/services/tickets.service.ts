import type {
  CreateTicketRequest,
  ListTicketsQuery,
  Ticket,
  TicketDetail,
  TicketsListResponse,
  UpdateTicketRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { findContactSummaries } from '../../contacts';
import type { ContactSummary } from '../../contacts';
import * as ticketsRepository from '../repositories/tickets.repository';
import type { TicketChanges, TicketRow } from '../repositories/tickets.repository';

// The database error code for "a foreign key points at nothing" (here: an owner who does not work for the business).
const FOREIGN_KEY_VIOLATION = '23503';

/** True when the error is the database saying a foreign key points at nothing. */
const isForeignKeyViolation = (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === FOREIGN_KEY_VIOLATION;

/** The person to filter by: `me` is the signed-in person, `unassigned` names nobody, anything else is a person's id. */
function pickOwnerFilter(ownerFilter: string | undefined, signedInUserId: string): string | undefined {
  if (ownerFilter === 'me') return signedInUserId;
  if (ownerFilter === 'unassigned') return undefined;
  return ownerFilter;
}

/** Turns a database row plus the person it is for into the Ticket the API answers with. */
function toTicket(row: TicketRow, contact: ContactSummary | undefined): Ticket {
  return {
    id: row.id,
    contactId: row.contactId,
    contact: contact ?? null,
    title: row.title,
    details: row.details,
    type: row.type,
    priority: row.priority,
    status: row.status,
    ownerUserId: row.ownerUserId,
    conversationTypeKey: row.conversationTypeKey,
    closedAt: row.closedAt?.toISOString() ?? null,
    closedByUserId: row.closedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Everything about tickets that is not plain reading of the database. The routes call this.
 * Tickets are shared work: every role of the business sees every ticket (owner decision, 12 Nov 2026), so there is no
 * "own tickets only" filter here.
 */
export function createTicketsService({ database }: { database: Database }) {
  /** The ticket with its notes and the person it is for, as the API shows it. 404 when it is not the business's. */
  async function readTicket(transaction: Db, accountId: string, ticketId: string): Promise<TicketDetail> {
    const ticket = await ticketsRepository.findTicketById(transaction, accountId, ticketId);
    if (!ticket) throw notFound('That ticket');
    const notes = await ticketsRepository.listNotesForTicket(transaction, accountId, ticketId);
    const contacts = await findContactSummaries(transaction, { accountId, contactIds: [ticket.contactId] });
    return {
      ...toTicket(ticket, contacts[0]),
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        writtenByUserId: note.writtenByUserId,
        createdAt: note.createdAt.toISOString(),
      })),
    };
  }

  return {
    /**
     * Adds an open ticket for a contact. The type is `other` and the priority `normal` unless sent; the ticket has no owner
     * unless one is named. A contact that is missing, deleted or another business's, and an owner from another business,
     * answer 404. Writes an activity-log line and the `ticket.created` event. Answers with the new ticket.
     */
    async createTicket(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: CreateTicketRequest,
    ): Promise<TicketDetail> {
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          const contacts = await findContactSummaries(transaction, { accountId, contactIds: [request.contactId] });
          if (contacts.length === 0) throw notFound('That contact');

          const ticketId = uuidv7();
          const type = request.type ?? 'other';
          const priority = request.priority ?? 'normal';
          const ownerUserId = request.ownerUserId ?? null;
          await ticketsRepository.insertTicket(transaction, {
            id: ticketId,
            accountId,
            contactId: request.contactId,
            title: request.title,
            details: request.details ?? null,
            type,
            priority,
            ownerUserId,
            actor,
          });

          await writeActivityLog(transaction, {
            accountId,
            actor,
            kind: 'tickets.created',
            // Which fields were filled in, never their values
            details: {
              recordType: 'ticket',
              recordId: ticketId,
              fields: Object.keys(request).filter((field) => request[field as keyof CreateTicketRequest] !== undefined),
            },
          });
          await publishEvent(transaction, {
            accountId,
            eventName: 'ticket.created',
            payload: { ticketId, contactId: request.contactId, ownerUserId, type, priority },
          });
          return readTicket(transaction, accountId, ticketId);
        });
      } catch (error) {
        // The owner is not a person of this business (the database checks the business): answer like any unknown id
        if (isForeignKeyViolation(error)) throw notFound('That person');
        throw error;
      }
    },

    /**
     * One page of the business's tickets, newest first, narrowed by the filters. `ownerUserId=me` means the signed-in
     * person and `unassigned` means tickets nobody owns. Every role sees every ticket. Each ticket shows who it is for.
     */
    async listTickets(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      query: ListTicketsQuery,
    ): Promise<TicketsListResponse> {
      const accountId = principal.accountId;
      return database.runInAccountTransaction(accountId, async (transaction) => {
        const { rows, total } = await ticketsRepository.listTicketRows(
          transaction,
          {
            accountId,
            status: query.status,
            ownerUserId: pickOwnerFilter(query.ownerUserId, principal.userId),
            unassignedOnly: query.ownerUserId === 'unassigned',
            type: query.type,
            priority: query.priority,
            contactId: query.contactId,
          },
          { limit: query.limit, offset: (query.page - 1) * query.limit },
        );
        const contacts = await findContactSummaries(transaction, {
          accountId,
          contactIds: [...new Set(rows.map((row) => row.contactId))],
        });
        const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
        return {
          items: rows.map((row) => toTicket(row, contactsById.get(row.contactId))),
          total,
          page: query.page,
          limit: query.limit,
        };
      });
    },

    /**
     * Changes a ticket: assign it (or leave it with nobody), rename it, change its details, type or priority, add a note,
     * close it (`status: done`) or reopen it (`status: open`). Only what really changes is written; sending the values it
     * already has changes nothing and writes no log line. A closed ticket accepts a note or a reopen; any other change to it
     * answers 409 TICKET_CLOSED (send `status: open` together with the change to reopen and change it in one step). An
     * unknown ticket, another business's ticket and an owner from another business answer 404.
     * Events: ticket.updated, ticket.assigned (a new owner), ticket.note_added, ticket.closed, ticket.reopened.
     */
    async updateTicket(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      ticketId: string,
      request: UpdateTicketRequest,
    ): Promise<TicketDetail> {
      if (Object.values(request).every((value) => value === undefined)) {
        throw new ApiError(400, 'NOTHING_TO_CHANGE', 'Send at least one field to change.');
      }
      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };

      try {
        return await database.runInAccountTransaction(accountId, async (transaction) => {
          // Two people changing one ticket at the same moment take turns
          if (!(await ticketsRepository.lockTicketForUpdate(transaction, accountId, ticketId))) {
            throw notFound('That ticket');
          }
          const current = await ticketsRepository.findTicketById(transaction, accountId, ticketId);
          if (!current) throw notFound('That ticket');

          // A closed ticket takes a note or a reopen, but no other change unless it is reopened in the same step
          const asksToChangeFields = [
            request.title,
            request.details,
            request.type,
            request.priority,
            request.ownerUserId,
          ].some((value) => value !== undefined);
          const staysClosed = current.status === 'done' && request.status !== 'open';
          if (staysClosed && asksToChangeFields) {
            throw conflict('TICKET_CLOSED', 'This ticket is closed. Reopen it before changing it.');
          }

          // What the ticket would look like: a field not sent stays as it is, `null` clears details or the owner
          const changes: TicketChanges = {};
          if (request.title !== undefined && request.title !== current.title) changes.title = request.title;
          if (request.details !== undefined && request.details !== current.details) changes.details = request.details;
          if (request.type !== undefined && request.type !== current.type) changes.type = request.type;
          if (request.priority !== undefined && request.priority !== current.priority) {
            changes.priority = request.priority;
          }
          if (request.ownerUserId !== undefined && request.ownerUserId !== current.ownerUserId) {
            changes.ownerUserId = request.ownerUserId;
          }
          const changedFields = Object.keys(changes); // the names of the fields that really change

          // Closing and reopening are not field edits: they have their own log lines and events
          const newStatus =
            request.status !== undefined && request.status !== current.status ? request.status : undefined;
          if (newStatus === 'done') Object.assign(changes, { status: 'done', closedAt: new Date(), closedBy: actor });
          if (newStatus === 'open') Object.assign(changes, { status: 'open', closedAt: null, closedBy: null });

          if (Object.keys(changes).length > 0) {
            await ticketsRepository.updateTicket(transaction, { accountId, ticketId, changes, actor });
          }
          if (changedFields.length > 0) {
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'tickets.updated',
              // Which fields changed, never their values
              details: { recordType: 'ticket', recordId: ticketId, fields: changedFields },
            });
            await publishEvent(transaction, {
              accountId,
              eventName: 'ticket.updated',
              payload: { ticketId, fields: changedFields },
            });
          }
          if ('ownerUserId' in changes) {
            await publishEvent(transaction, {
              accountId,
              eventName: 'ticket.assigned',
              payload: {
                ticketId,
                ownerUserId: changes.ownerUserId ?? null,
                previousOwnerUserId: current.ownerUserId,
              },
            });
          }

          if (request.note !== undefined) {
            const noteId = uuidv7();
            await ticketsRepository.insertTicketNote(transaction, {
              id: noteId,
              accountId,
              ticketId,
              body: request.note,
              actor,
            });
            // The note's words are never logged, only that a note was added
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: 'tickets.note_added',
              details: { recordType: 'ticket', recordId: ticketId, fields: ['note'] },
            });
            await publishEvent(transaction, {
              accountId,
              eventName: 'ticket.note_added',
              payload: { ticketId, noteId },
            });
          }

          if (newStatus !== undefined) {
            const closing = newStatus === 'done';
            await writeActivityLog(transaction, {
              accountId,
              actor,
              kind: closing ? 'tickets.closed' : 'tickets.reopened',
              details: { recordType: 'ticket', recordId: ticketId, fields: ['status'] },
            });
            await publishEvent(transaction, {
              accountId,
              eventName: closing ? 'ticket.closed' : 'ticket.reopened',
              payload: {
                ticketId,
                contactId: current.contactId,
                ownerUserId: changes.ownerUserId ?? current.ownerUserId,
              },
            });
          }
          return readTicket(transaction, accountId, ticketId);
        });
      } catch (error) {
        // The owner is not a person of this business (the database checks the business): answer like any unknown id
        if (isForeignKeyViolation(error)) throw notFound('That person');
        throw error;
      }
    },

    /** One ticket of the business with its notes. An unknown id and another business's ticket both answer 404. */
    async getTicket(principal: Pick<Principal, 'accountId'>, ticketId: string): Promise<TicketDetail> {
      return database.runInAccountTransaction(principal.accountId, (transaction) =>
        readTicket(transaction, principal.accountId, ticketId),
      );
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;
