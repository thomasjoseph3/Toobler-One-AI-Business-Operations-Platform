import type { TicketPriority, TicketStatus, TicketType } from '@toobler-one/shared';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { userIdFromActorStamp } from '../helpers/actor-stamp';

// The SQL for the `tickets` and `ticket_notes` tables. Every query names the business as well as the id (defence in
// depth: the database also fences every query by business).

/** A ticket as the database holds it. The service turns it into the API's Ticket. */
export interface TicketRow {
  id: string;
  contactId: string;
  title: string;
  details: string | null;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  ownerUserId: string | null;
  conversationTypeKey: string | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A note on a ticket as the database holds it. */
export interface TicketNoteRow {
  id: string;
  body: string;
  writtenByUserId: string | null;
  createdAt: Date;
}

/** Adds a ticket. It starts open. Fails with a foreign-key error when the owner does not work for the business. */
export async function insertTicket(
  db: Db,
  ticket: {
    id: string;
    accountId: string;
    contactId: string;
    title: string;
    details: string | null;
    type: TicketType;
    priority: TicketPriority;
    ownerUserId: string | null;
    actor: Actor;
  },
): Promise<void> {
  const actorStamp = { kind: ticket.actor.kind, id: ticket.actor.id };
  await db
    .insertInto('tickets')
    .values({
      id: ticket.id,
      account_id: ticket.accountId,
      contact_id: ticket.contactId,
      title: ticket.title,
      details: ticket.details,
      type: ticket.type,
      priority: ticket.priority,
      owner_user_id: ticket.ownerUserId,
      created_by: actorStamp,
      updated_by: actorStamp,
    })
    .execute();
}

/** One ticket of the business, or undefined when the id is unknown or belongs to another business. */
export async function findTicketById(db: Db, accountId: string, ticketId: string): Promise<TicketRow | undefined> {
  const row = await db
    .selectFrom('tickets')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', ticketId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    id: row.id,
    contactId: row.contact_id,
    title: row.title,
    details: row.details,
    type: row.type,
    priority: row.priority,
    status: row.status,
    ownerUserId: row.owner_user_id,
    conversationTypeKey: row.conversation_type_key,
    closedAt: row.closed_at,
    closedByUserId: userIdFromActorStamp(row.closed_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The notes of one ticket, oldest first. */
export async function listNotesForTicket(db: Db, accountId: string, ticketId: string): Promise<TicketNoteRow[]> {
  const rows = await db
    .selectFrom('ticket_notes')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('ticket_id', '=', ticketId)
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    writtenByUserId: userIdFromActorStamp(row.created_by),
    createdAt: row.created_at,
  }));
}
