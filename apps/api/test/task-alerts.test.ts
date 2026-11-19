import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import type { MailMessage, MailSender } from '../src/providers/mail';
import { createTaskAlertsService } from '../src/modules/core/tasks/services/task-alerts.service';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { createPretendBrowser, type PretendBrowser } from './support/browser';
import { openTestDatabase } from './support/harness';

// F08 slice 3: the reminder before a task is due and the late alert after. The service is called with a chosen "now" and a recording mail
// sender, the way the minute-by-minute job calls it.

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

interface Person {
  browser: PretendBrowser;
  userId: string;
  businessId: string;
  email: string;
}

/** Signs a new owner up and in (a manager with a confirmed email), with a pretend browser holding their sign-in cookie. */
async function signUpAndSignIn(): Promise<Person> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  const user = await database.system
    .selectFrom('users')
    .select(['email', 'email_verified_at'])
    .where('id', '=', signedIn.profile.user.id)
    .executeTakeFirstOrThrow();
  // The alerts go to confirmed addresses only
  if (user.email_verified_at === null) {
    await database.system
      .updateTable('users')
      .set({ email_verified_at: new Date() })
      .where('id', '=', signedIn.profile.user.id)
      .execute();
  }
  return { browser, userId: signedIn.profile.user.id, businessId: signedIn.profile.business.id, email: user.email };
}

/** A mail sender that keeps what it was asked to send, and can be told to fail. */
function recordingMail(): { sender: MailSender; sent: MailMessage[]; failNext: { value: boolean } } {
  const sent: MailMessage[] = [];
  const failNext = { value: false };
  return {
    sent,
    failNext,
    sender: {
      async send(message) {
        if (failNext.value) throw new Error('mail server down');
        sent.push(message);
      },
    },
  };
}

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const NOW = new Date('2026-11-17T10:00:00Z');
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

/** Adds a person, a lead and a task for the owner, then moves its due time to `dueAt` directly (the API only takes future times well). */
async function addTaskDueAt(person: Person, dueAt: Date, title = 'Call Priya'): Promise<string> {
  const contact = await person.browser.send('POST', '/api/v1/contacts', {
    name: 'Priya Menon',
    phone: uniqueUaeNumber(),
  });
  const lead = await person.browser.send('POST', '/api/v1/leads', {
    contactId: contact.json().id,
    interest: 'Three nights',
  });
  const task = await person.browser.send('POST', '/api/v1/tasks', {
    leadId: lead.json().id,
    title,
    dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  });
  expect(task.statusCode).toBe(201);
  await database.system.updateTable('tasks').set({ due_at: dueAt }).where('id', '=', task.json().id).execute();
  return task.json().id as string;
}

/** Adds another person to the business directly in the database. */
async function addPerson(
  person: Person,
  role: 'manager' | 'staff',
  isEmailConfirmed: boolean,
): Promise<{ id: string; email: string }> {
  const email = `${role}-${randomUUID()}@example.com`;
  const row = await database.system
    .insertInto('users')
    .values({
      id: randomUUID(),
      account_id: person.businessId,
      name: role === 'manager' ? 'Second Manager' : 'Ravi Kumar',
      email,
      role,
      email_verified_at: isEmailConfirmed ? new Date() : null,
    } as never)
    .returning('id')
    .executeTakeFirstOrThrow();
  return { id: row.id, email };
}

const readMarks = (taskId: string) =>
  database.system
    .selectFrom('tasks')
    .select(['reminded_at', 'overdue_alerted_at'])
    .where('id', '=', taskId)
    .executeTakeFirstOrThrow();

describe('the reminder before a task is due', () => {
  it('emails the owner once, 15 minutes before by default, and notes it with one log line and one event (no words, no address)', async () => {
    const owner = await signUpAndSignIn();
    const taskId = await addTaskDueAt(owner, minutesFromNow(10), 'Secret-title-words');
    const mail = recordingMail();
    const alerts = createTaskAlertsService({ database, mail: mail.sender });
    expect(await alerts.sendAlertsForBusiness(owner.businessId, NOW)).toEqual({
      reminders: 1,
      lateAlerts: 0,
      failed: 0,
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: owner.email, subject: 'Reminder: Secret-title-words' });
    expect((await readMarks(taskId)).reminded_at).not.toBeNull();
    // Running again sends nothing new
    expect(await alerts.sendAlertsForBusiness(owner.businessId, minutesFromNow(1))).toMatchObject({ reminders: 0 });
    expect(mail.sent).toHaveLength(1);
    const logs = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('record_id', '=', taskId)
      .where('kind', '=', 'tasks.reminder_sent')
      .execute();
    expect(logs).toHaveLength(1);
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'task.reminder_sent')
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events) + JSON.stringify(logs)).not.toContain('Secret-title-words');
    expect(JSON.stringify(events)).not.toContain(owner.email);
  });

  it('stays quiet for a task that is not due soon, is already done, was deleted or is already past', async () => {
    const owner = await signUpAndSignIn();
    await addTaskDueAt(owner, minutesFromNow(60), 'Far away');
    const done = await addTaskDueAt(owner, minutesFromNow(5), 'Done one');
    const deleted = await addTaskDueAt(owner, minutesFromNow(5), 'Deleted one');
    await addTaskDueAt(owner, minutesFromNow(-2), 'Already past');
    await database.system.updateTable('tasks').set({ done_at: NOW }).where('id', '=', done).execute();
    await database.system.updateTable('tasks').set({ deleted_at: NOW }).where('id', '=', deleted).execute();
    const mail = recordingMail();
    const result = await createTaskAlertsService({ database, mail: mail.sender }).sendAlertsForBusiness(
      owner.businessId,
      NOW,
    );
    expect(result.reminders).toBe(0);
    expect(mail.sent.filter((message) => message.subject.startsWith('Reminder'))).toHaveLength(0);
  });

  it('follows the business’s own minutes', async () => {
    const owner = await signUpAndSignIn();
    await addTaskDueAt(owner, minutesFromNow(45));
    const mail = recordingMail();
    const alerts = createTaskAlertsService({ database, mail: mail.sender });
    expect((await alerts.sendAlertsForBusiness(owner.businessId, NOW)).reminders).toBe(0);
    await database.system
      .updateTable('accounts')
      .set({ task_reminder_minutes: 60 })
      .where('id', '=', owner.businessId)
      .execute();
    expect((await alerts.sendAlertsForBusiness(owner.businessId, NOW)).reminders).toBe(1);
  });

  it('is tried again next minute when the mail server is down, and marks a task nobody can be told about', async () => {
    const owner = await signUpAndSignIn();
    const taskId = await addTaskDueAt(owner, minutesFromNow(10));
    const mail = recordingMail();
    const alerts = createTaskAlertsService({ database, mail: mail.sender });
    mail.failNext.value = true;
    expect(await alerts.sendAlertsForBusiness(owner.businessId, NOW)).toEqual({
      reminders: 0,
      lateAlerts: 0,
      failed: 1,
    });
    expect((await readMarks(taskId)).reminded_at).toBeNull();
    mail.failNext.value = false;
    expect((await alerts.sendAlertsForBusiness(owner.businessId, minutesFromNow(1))).reminders).toBe(1);

    // An owner with no confirmed address cannot be told: the task is marked and nothing is sent
    const unconfirmed = await addPerson(owner, 'staff', false);
    const otherTaskId = await addTaskDueAt(owner, minutesFromNow(10), 'For Ravi');
    await database.system
      .updateTable('tasks')
      .set({ owner_user_id: unconfirmed.id })
      .where('id', '=', otherTaskId)
      .execute();
    const before = mail.sent.length;
    await alerts.sendAlertsForBusiness(owner.businessId, NOW);
    expect(mail.sent).toHaveLength(before);
    expect((await readMarks(otherTaskId)).reminded_at).not.toBeNull();
  });
});

describe('the late alert after a task is due', () => {
  it('emails every manager with a confirmed address once, 15 minutes after by default, and nobody else', async () => {
    const owner = await signUpAndSignIn();
    const secondManager = await addPerson(owner, 'manager', true);
    await addPerson(owner, 'manager', false);
    await addPerson(owner, 'staff', true);
    const taskId = await addTaskDueAt(owner, minutesFromNow(-20));
    const mail = recordingMail();
    const alerts = createTaskAlertsService({ database, mail: mail.sender });
    expect(await alerts.sendAlertsForBusiness(owner.businessId, NOW)).toEqual({
      reminders: 0,
      lateAlerts: 1,
      failed: 0,
    });
    expect(mail.sent.map((message) => message.to).sort()).toEqual([owner.email, secondManager.email].sort());
    expect(mail.sent[0]!.subject).toBe('Late task: Call Priya');
    expect((await readMarks(taskId)).overdue_alerted_at).not.toBeNull();
    expect((await alerts.sendAlertsForBusiness(owner.businessId, minutesFromNow(1))).lateAlerts).toBe(0);
    expect(mail.sent).toHaveLength(2);
  });

  it('waits until the task is 15 minutes late, and lets a task more than a day late stay quiet', async () => {
    const owner = await signUpAndSignIn();
    await addTaskDueAt(owner, minutesFromNow(-10), 'Only ten minutes late');
    await addTaskDueAt(owner, minutesFromNow(-25 * 60), 'Forgotten for a day');
    const mail = recordingMail();
    const result = await createTaskAlertsService({ database, mail: mail.sender }).sendAlertsForBusiness(
      owner.businessId,
      NOW,
    );
    expect(result.lateAlerts).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it('does not alert for a task that was ticked off in time', async () => {
    const owner = await signUpAndSignIn();
    const taskId = await addTaskDueAt(owner, minutesFromNow(-20));
    await database.system
      .updateTable('tasks')
      .set({ done_at: minutesFromNow(-18) })
      .where('id', '=', taskId)
      .execute();
    const mail = recordingMail();
    expect(
      (await createTaskAlertsService({ database, mail: mail.sender }).sendAlertsForBusiness(owner.businessId, NOW))
        .lateAlerts,
    ).toBe(0);
  });

  it('fires again after a snooze (a new due time clears the marks)', async () => {
    const owner = await signUpAndSignIn();
    const taskId = await addTaskDueAt(owner, minutesFromNow(-20));
    const mail = recordingMail();
    const alerts = createTaskAlertsService({ database, mail: mail.sender });
    await alerts.sendAlertsForBusiness(owner.businessId, NOW);
    expect(mail.sent).toHaveLength(1);
    const snoozed = await owner.browser.send('PATCH', `/api/v1/tasks/${taskId}`, {
      dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(snoozed.statusCode).toBe(200);
    expect(await readMarks(taskId)).toEqual({ reminded_at: null, overdue_alerted_at: null });
  });
});

describe('the fence between businesses', () => {
  it('only looks at the business it was asked about', async () => {
    const first = await signUpAndSignIn();
    const second = await signUpAndSignIn();
    const theirTaskId = await addTaskDueAt(second, minutesFromNow(10));
    const mail = recordingMail();
    await createTaskAlertsService({ database, mail: mail.sender }).sendAlertsForBusiness(first.businessId, NOW);
    expect(mail.sent).toHaveLength(0);
    expect((await readMarks(theirTaskId)).reminded_at).toBeNull();
  });
});
