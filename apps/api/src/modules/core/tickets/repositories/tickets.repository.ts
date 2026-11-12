import type { TicketPriority, TicketStatus, TicketType } from '@toobler-one/shared';
import type { Selectable } from 'kysely';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import type { TicketsTable } from '../../../../kernel/database/types';
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

/** Turns a database row of `tickets` into a TicketRow. */
function toTicketRow(row: Selectable<TicketsTable>): TicketRow {
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

/** One ticket of the business, or undefined when the id is unknown or belongs to another business. */
export async function findTicketById(db: Db, accountId: string, ticketId: string): Promise<TicketRow | undefined> {
  const row = await db
    .selectFrom('tickets')
    .selectAll()
    .where('account_id', '=', accountId)
    .where('id', '=', ticketId)
    .executeTakeFirst();
  return row ? toTicketRow(row) : undefined;
}

/** Which tickets a list should hold. A filter that is left out does not narrow anything. */
export interface TicketFilters {
  accountId: string;
  status?: TicketStatus | undefined;
  /** Only tickets owned by this person. */
  ownerUserId?: string | undefined;
  /** Only tickets nobody owns. */
  unassignedOnly?: boolean | undefined;
  type?: TicketType | undefined;
  priority?: TicketPriority | undefined;
  contactId?: string | undefined;
}

/** The query every list read starts from: the business's tickets, narrowed by the filters. */
function selectTicketRows(db: Db, filters: TicketFilters) {
  let query = db.selectFrom('tickets').where('account_id', '=', filters.accountId);
  if (filters.status) query = query.where('status', '=', filters.status);
  if (filters.ownerUserId) query = query.where('owner_user_id', '=', filters.ownerUserId);
  if (filters.unassignedOnly) query = query.where('owner_user_id', 'is', null);
  if (filters.type) query = query.where('type', '=', filters.type);
  if (filters.priority) query = query.where('priority', '=', filters.priority);
  if (filters.contactId) query = query.where('contact_id', '=', filters.contactId);
  return query;
}

/** One page of tickets, newest first, and how many tickets match in all. */
export async function listTicketRows(
  db: Db,
  filters: TicketFilters,
  paging: { limit: number; offset: number },
): Promise<{ rows: TicketRow[]; total: number }> {
  const rows = await selectTicketRows(db, filters)
    .selectAll()
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(paging.limit)
    .offset(paging.offset)
    .execute();
  const countRow = await selectTicketRows(db, filters)
    .select((expression) => expression.fn.countAll<string>().as('total'))
    .executeTakeFirstOrThrow();
  return { rows: rows.map(toTicketRow), total: Number(countRow.total) };
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
