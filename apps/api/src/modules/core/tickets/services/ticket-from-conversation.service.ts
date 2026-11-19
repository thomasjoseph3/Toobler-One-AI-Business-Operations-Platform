import type { TicketPriority, TicketType } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import { lockContactForUpdate } from '../../contacts';
import * as ticketsRepository from '../repositories/tickets.repository';

/** What was done with the request. */
export type TicketFromConversationResult =
  | { action: 'created'; ticketId: string }
  /** The person already had an open ticket of this kind: a note was added to it instead of making another. */
  | { action: 'joined'; ticketId: string };

/**
 * Gives a request from a conversation (a complaint, a callback, a question about something already bought) to a ticket: the person's
 * newest open ticket of the same kind takes it as a new note, otherwise a ticket is made, unassigned, with the kind and priority the
 * conversation type says. `title` is the type's name and `details` the AI's one-line reason (it carries no personal details); the words
 * the customer wrote are never copied into the ticket.
 *
 * It takes the caller's transaction and joins it. The contact is locked first, so two conversations from one person sorted at the same
 * moment take turns and the second joins the first one's ticket. Writes the activity-log line and the event of what it did.
 */
export async function applyTicketFromConversation(
  transaction: Db,
  options: {
    accountId: string;
    contactId: string;
    ticketType: TicketType;
    priority: TicketPriority;
    title: string;
    details: string | null;
    conversationTypeKey: string;
    /** For a joined ticket: what the note says (written by code, e.g. "Another conversation on web chat was sorted as Complaint"). */
    noteWhenJoined: string;
    actor: Actor;
  },
): Promise<TicketFromConversationResult> {
  const { accountId, contactId, actor } = options;
  if (!(await lockContactForUpdate(transaction, accountId, contactId))) {
    throw new Error('The contact for this request no longer exists.');
  }

  const openTicket = await ticketsRepository.findNewestOpenTicketOfKindForContact(
    transaction,
    accountId,
    contactId,
    options.ticketType,
  );
  if (openTicket) {
    await ticketsRepository.lockTicketForUpdate(transaction, accountId, openTicket.id);
    const noteId = uuidv7();
    await ticketsRepository.insertTicketNote(transaction, {
      id: noteId,
      accountId,
      ticketId: openTicket.id,
      body: options.noteWhenJoined.slice(0, 2000),
      actor,
    });
    await writeActivityLog(transaction, {
      accountId,
      actor,
      kind: 'tickets.joined_by_conversation',
      details: { recordType: 'ticket', recordId: openTicket.id, fields: ['notes'] },
    });
    await publishEvent(transaction, {
      accountId,
      eventName: 'ticket.note_added',
      payload: { ticketId: openTicket.id, noteId },
    });
    return { action: 'joined', ticketId: openTicket.id };
  }

  const ticketId = uuidv7();
  await ticketsRepository.insertTicket(transaction, {
    id: ticketId,
    accountId,
    contactId,
    title: options.title.slice(0, 200),
    details: options.details === null ? null : options.details.slice(0, 2000),
    type: options.ticketType,
    priority: options.priority,
    ownerUserId: null,
    conversationTypeKey: options.conversationTypeKey,
    actor,
  });
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: 'tickets.created_by_conversation',
    details: { recordType: 'ticket', recordId: ticketId },
  });
  await publishEvent(transaction, {
    accountId,
    eventName: 'ticket.created',
    payload: { ticketId, contactId, ownerUserId: null, type: options.ticketType, priority: options.priority },
  });
  return { action: 'created', ticketId };
}
