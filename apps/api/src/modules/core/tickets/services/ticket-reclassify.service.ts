import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Db } from '../../../../kernel/database';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import * as ticketsRepository from '../repositories/tickets.repository';

/**
 * Closes a ticket because staff said the conversation behind it was not a service request ("This isn't a ticket"). The ticket is kept,
 * marked done, with a note saying why (written by code, with no customer words), so the history stays. A ticket that is already closed
 * (or gone) is left alone. It takes the caller's transaction and joins it. Returns true when the ticket was closed now.
 */
export async function closeTicketAsReclassified(
  transaction: Db,
  options: { accountId: string; ticketId: string; noteText: string; actor: Actor },
): Promise<boolean> {
  const { accountId, ticketId, actor } = options;
  if (!(await ticketsRepository.lockTicketForUpdate(transaction, accountId, ticketId))) return false;
  const ticket = await ticketsRepository.findTicketById(transaction, accountId, ticketId);
  if (!ticket || ticket.status === 'done') return false;

  await ticketsRepository.updateTicket(transaction, {
    accountId,
    ticketId,
    changes: { status: 'done', closedAt: new Date(), closedBy: actor },
    actor,
  });
  const noteId = uuidv7();
  await ticketsRepository.insertTicketNote(transaction, {
    id: noteId,
    accountId,
    ticketId,
    body: options.noteText.slice(0, 2000),
    actor,
  });
  await writeActivityLog(transaction, {
    accountId,
    actor,
    kind: 'tickets.reclassified',
    details: { recordType: 'ticket', recordId: ticketId, fields: ['status', 'notes'] },
  });
  await publishEvent(transaction, { accountId, eventName: 'ticket.closed', payload: { ticketId } });
  return true;
}
