import type { Actor } from '../../../../kernel/context';
import type { Database, Db } from '../../../../kernel/database';
import { writeActivityLog } from '../../../../kernel/activity-log';
import { publishEvent } from '../../../../kernel/events/publish';
import type { MailMessage, MailSender } from '../../../../providers/mail';
import {
  findBusinessIdentity,
  findManagersToEmail,
  findPeopleSummaries,
  findPeopleToEmail,
  findTaskAlertSettings,
} from '../../auth';
import { findContactSummaries } from '../../contacts';
import { buildLateAlertEmail, buildReminderEmail, formatDueText, type TaskAlertFacts } from '../helpers/alert-emails';
import * as tasksRepository from '../repositories/tasks.repository';
import type { TaskRow } from '../repositories/tasks.repository';

/** Who the alert rows are written as: this module itself, not a person. */
const ALERT_ACTOR: Actor = { kind: 'system', id: 'core.tasks' };

/** One email to send, and the task it is about, so the task can be marked once the email went out. */
interface PlannedAlert {
  kind: 'reminder' | 'late_alert';
  task: TaskRow;
  /** The emails for this task (one for a reminder, one per manager for a late alert); empty when nobody can be told. */
  messages: MailMessage[];
}

/**
 * The reminder and late-alert emails of tasks (F08). Once a minute, for each business: the owner of an open task is reminded
 * `task_reminder_minutes` before it is due, and the managers are told when it is still open `task_late_alert_minutes` after. Each task
 * is reminded once and alerted once per due time (snoozing it clears the marks). The email goes out first and the task is marked
 * afterwards, so a failed send is tried again the next minute. Email only for now (WhatsApp arrives with F25).
 */
export function createTaskAlertsService({
  database,
  mail,
  businessNameFallback = 'your business',
}: {
  database: Database;
  mail: MailSender;
  businessNameFallback?: string;
}) {
  // Reads what is due and writes the emails, without sending anything (all inside the business's fence)
  async function planAlerts(transaction: Db, accountId: string, now: Date): Promise<PlannedAlert[]> {
    const settings = await findTaskAlertSettings(transaction, accountId);
    if (!settings) return [];
    const businessName = (await findBusinessIdentity(transaction, accountId))?.name ?? businessNameFallback;
    const toRemind = await tasksRepository.listTasksToRemind(transaction, {
      accountId,
      now,
      reminderMinutes: settings.reminderMinutes,
    });
    const toAlert = await tasksRepository.listTasksToAlertLate(transaction, {
      accountId,
      now,
      lateAlertMinutes: settings.lateAlertMinutes,
    });
    const tasks = [...toRemind, ...toAlert];
    if (tasks.length === 0) return [];

    const contacts = await findContactSummaries(transaction, {
      accountId,
      contactIds: [...new Set(tasks.map((task) => task.contactId))],
    });
    const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
    const ownerIds = [...new Set(tasks.map((task) => task.ownerUserId))];
    const ownersToEmail = await findPeopleToEmail(transaction, { accountId, userIds: ownerIds });
    const ownerToEmailById = new Map(ownersToEmail.map((person) => [person.id, person]));
    const ownerNames = await findPeopleSummaries(transaction, { accountId, userIds: ownerIds });
    const ownerNameById = new Map(ownerNames.map((person) => [person.id, person.name]));
    const managers = toAlert.length > 0 ? await findManagersToEmail(transaction, { accountId }) : [];

    const factsFor = (task: TaskRow): TaskAlertFacts => ({
      title: task.title,
      contactName: contactById.get(task.contactId)?.name ?? null,
      dueText: formatDueText(task.dueAt, settings.timeZone),
      businessName,
    });
    const planned: PlannedAlert[] = [];
    for (const task of toRemind) {
      const owner = ownerToEmailById.get(task.ownerUserId);
      planned.push({
        kind: 'reminder',
        task,
        messages: owner ? [buildReminderEmail({ to: owner.email, ownerName: owner.name, task: factsFor(task) })] : [],
      });
    }
    for (const task of toAlert) {
      planned.push({
        kind: 'late_alert',
        task,
        messages: managers.map((manager) =>
          buildLateAlertEmail({
            to: manager.email,
            managerName: manager.name,
            ownerName: ownerNameById.get(task.ownerUserId) ?? null,
            task: factsFor(task),
          }),
        ),
      });
    }
    return planned;
  }

  // Marks one task as done with this alert, with one log line and one event (ids only: never the words or the addresses)
  async function markAlertSent(transaction: Db, accountId: string, alert: PlannedAlert, now: Date): Promise<void> {
    const options = { accountId, taskId: alert.task.id, at: now, actor: ALERT_ACTOR };
    if (alert.kind === 'reminder') await tasksRepository.markReminded(transaction, options);
    else await tasksRepository.markLateAlerted(transaction, options);
    await writeActivityLog(transaction, {
      accountId,
      actor: ALERT_ACTOR,
      kind: alert.kind === 'reminder' ? 'tasks.reminder_sent' : 'tasks.late_alert_sent',
      details: { recordType: 'task', recordId: alert.task.id },
    });
    await publishEvent(transaction, {
      accountId,
      eventName: alert.kind === 'reminder' ? 'task.reminder_sent' : 'task.late_alerted',
      payload: {
        taskId: alert.task.id,
        leadId: alert.task.leadId,
        contactId: alert.task.contactId,
        ownerUserId: alert.task.ownerUserId,
      },
    });
  }

  return {
    /**
     * Sends the reminders and late alerts that are due for one business at `now`. A task nobody can be told about (the owner has no
     * confirmed email, no manager has one) is marked all the same, so it is not looked at again every minute. Returns how many reminders
     * and late alerts were handled, and how many could not be sent (those are tried again next minute).
     */
    async sendAlertsForBusiness(
      accountId: string,
      now: Date = new Date(),
    ): Promise<{ reminders: number; lateAlerts: number; failed: number }> {
      const planned = await database.runInAccountTransaction(accountId, (transaction) =>
        planAlerts(transaction, accountId, now),
      );
      const result = { reminders: 0, lateAlerts: 0, failed: 0 };
      for (const alert of planned) {
        try {
          for (const message of alert.messages) await mail.send(message);
        } catch {
          result.failed += 1;
          continue;
        }
        await database.runInAccountTransaction(accountId, (transaction) =>
          markAlertSent(transaction, accountId, alert, now),
        );
        if (alert.kind === 'reminder') result.reminders += 1;
        else result.lateAlerts += 1;
      }
      return result;
    },
  };
}
