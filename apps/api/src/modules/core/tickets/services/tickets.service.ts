import type {
  CreateTicketRequest,
  ListTicketsQuery,
  Ticket,
  TicketDetail,
  TicketsListResponse,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { notFound } from '../../../../kernel/errors';
import { publishEvent } from '../../../../kernel/events/publish';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { findContactSummaries } from '../../contacts';
import type { ContactSummary } from '../../contacts';
import * as ticketsRepository from '../repositories/tickets.repository';
import type { TicketRow } from '../repositories/tickets.repository';

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

    /** One ticket of the business with its notes. An unknown id and another business's ticket both answer 404. */
    async getTicket(principal: Pick<Principal, 'accountId'>, ticketId: string): Promise<TicketDetail> {
      return database.runInAccountTransaction(principal.accountId, (transaction) =>
        readTicket(transaction, principal.accountId, ticketId),
      );
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;
