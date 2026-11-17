import type { AccountContext } from '../../../../kernel/context';
import type { DomainEvent } from '../../../../kernel/events/events';
import { uuidv7 } from '../../../../kernel/ids';
import { findTaskSummary } from '../../tasks';
import * as activitiesRepository from '../repositories/activities.repository';

/** Reads a text value from an event's payload, or undefined when it is missing or not text. */
function readText(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Who did it, from the event's `createdBy` / `movedBy`: a person of the business (shown by name), an agent such as the AI (shown by its
 * name), or nobody in particular (the system). Never throws on an odd payload: an unknown writer is written as the system.
 */
function readWriter(
  payload: Record<string, unknown>,
  key: string,
): { byUserId: string | null; byAgent: string | null } {
  const actor = payload[key];
  if (typeof actor !== 'object' || actor === null) return { byUserId: null, byAgent: null };
  const { kind, id } = actor as { kind?: unknown; id?: unknown };
  if (kind === 'user' && typeof id === 'string') return { byUserId: id, byAgent: null };
  if ((kind === 'agent' || kind === 'assistant') && typeof id === 'string') {
    return { byUserId: null, byAgent: id.slice(0, 60) };
  }
  return { byUserId: null, byAgent: null };
}

/**
 * Reacts to "a lead was added": writes "Lead added" on the lead's timeline. Safe to run twice for the same event (the line is keyed by
 * the event), and quietly does nothing when the event lacks the ids it needs.
 */
export async function handleLeadCreated(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const leadId = readText(event.payload, 'leadId');
  const contactId = readText(event.payload, 'contactId');
  if (leadId === undefined || contactId === undefined) return;
  const writer = readWriter(event.payload, 'createdBy');
  await accountContext.runInAccountTransaction(async (transaction) => {
    await activitiesRepository.insertSystemLine(transaction, {
      id: uuidv7(),
      accountId: accountContext.accountId,
      contactId,
      leadId,
      kind: 'lead_created',
      details: {},
      ...writer,
      sourceEventId: event.id,
      actor: accountContext.actor,
    });
  });
}

/**
 * Reacts to "a lead moved to another stage": writes "Moved from <stage> to <stage>" on the
 * lead's timeline, with the stage names as they were then. Safe to run twice for the same event.
 */
export async function handleLeadMoved(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  const leadId = readText(event.payload, 'leadId');
  const contactId = readText(event.payload, 'contactId');
  const toStageName = readText(event.payload, 'toStageName');
  if (leadId === undefined || contactId === undefined || toStageName === undefined) return;
  const details: Record<string, string> = { toStageName };
  const fromStageName = readText(event.payload, 'fromStageName');
  if (fromStageName !== undefined) details['fromStageName'] = fromStageName;
  const writer = readWriter(event.payload, 'movedBy');
  await accountContext.runInAccountTransaction(async (transaction) => {
    await activitiesRepository.insertSystemLine(transaction, {
      id: uuidv7(),
      accountId: accountContext.accountId,
      contactId,
      leadId,
      kind: 'stage_changed',
      details,
      ...writer,
      sourceEventId: event.id,
      actor: accountContext.actor,
    });
  });
}

/**
 * Writes a task line ("added the task ..." or "completed the task ...") on the timeline of the task's lead, or of its person when it has
 * no lead. The task's words are read from the task itself (events carry ids only) and kept with the line as they were then. Does nothing
 * when the event lacks ids or the task is gone.
 */
async function writeTaskLine(
  event: DomainEvent,
  accountContext: AccountContext,
  kind: 'task_created' | 'task_completed',
  writerKey: string,
): Promise<void> {
  const taskId = readText(event.payload, 'taskId');
  const contactId = readText(event.payload, 'contactId');
  if (taskId === undefined || contactId === undefined) return;
  const leadId = readText(event.payload, 'leadId');
  const writer = readWriter(event.payload, writerKey);
  await accountContext.runInAccountTransaction(async (transaction) => {
    const task = await findTaskSummary(transaction, { accountId: accountContext.accountId, taskId });
    if (!task) return;
    await activitiesRepository.insertSystemLine(transaction, {
      id: uuidv7(),
      accountId: accountContext.accountId,
      contactId,
      leadId: leadId ?? null,
      kind,
      details: { taskTitle: task.title, taskKind: task.kind },
      ...writer,
      sourceEventId: event.id,
      actor: accountContext.actor,
    });
  });
}

/** Reacts to "a task was added": writes "added the task ..." on the timeline. Safe to run twice for the same event. */
export async function handleTaskCreated(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  await writeTaskLine(event, accountContext, 'task_created', 'createdBy');
}

/** Reacts to "a task was ticked off": writes "completed the task ..." on the timeline. Safe to run twice for the same event. */
export async function handleTaskCompleted(event: DomainEvent, accountContext: AccountContext): Promise<void> {
  await writeTaskLine(event, accountContext, 'task_completed', 'by');
}
