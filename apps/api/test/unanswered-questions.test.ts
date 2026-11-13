import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUnansweredQuestionsService } from '../src/modules/core/knowledge';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;
let unansweredQuestionsService: ReturnType<typeof createUnansweredQuestionsService>;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
  unansweredQuestionsService = createUnansweredQuestionsService({ database });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** Lists unanswered questions as the person (or as nobody). `query` is the part after the `?`. */
const listUnanswered = (person: SignedInPerson | null, query = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/knowledge/unanswered${query ? `?${query}` : ''}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
  });

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** What the AI agent does when it cannot answer: logs the customer's question for the business. */
const agentLogs = (person: SignedInPerson, text: string) =>
  unansweredQuestionsService.logUnansweredQuestion(person.profile.business.id, { kind: 'agent', id: null }, text);

describe('logUnansweredQuestion (what the AI agent calls)', () => {
  it('saves a new question with a count of 1', async () => {
    const person = await createSignedInPerson(app, database);
    const logged = await agentLogs(person, 'Is there EV charging?');
    expect(logged).toMatchObject({ count: 1 });
    const items = (await listUnanswered(person)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      question: 'Is there EV charging?',
      count: 1,
      status: 'open',
      faqId: null,
      id: logged?.id,
    });
  });

  it('counts the same question asked again, ignoring capitals, punctuation and extra spaces, instead of making a new row', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'Is there EV charging?');
    await agentLogs(person, 'is there  ev charging');
    const third = await agentLogs(person, 'IS THERE EV CHARGING???');
    expect(third?.count).toBe(3);
    const items = (await listUnanswered(person)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ question: 'Is there EV charging?', count: 3 });
  });

  it('counts every ask when two customers ask at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    await Promise.all([agentLogs(person, 'Do you allow pets?'), agentLogs(person, 'do you allow pets')]);
    const items = (await listUnanswered(person)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(2);
  });

  it('keeps the same question in two businesses apart', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await agentLogs(first, 'Do you allow pets?');
    await agentLogs(second, 'Do you allow pets?');
    await agentLogs(second, 'Do you allow pets?');
    expect((await listUnanswered(first)).json().items[0].count).toBe(1);
    expect((await listUnanswered(second)).json().items[0].count).toBe(2);
  });

  it('blanks out emails and phone numbers before saving, and keeps them out of the log and events', async () => {
    const person = await createSignedInPerson(app, database);
    const logged = await agentLogs(person, 'Can asha@example.com or 9876543210 get a callback?');
    const items = (await listUnanswered(person)).json().items;
    expect(items[0].question).toBe('Can [email] or [number] get a callback?');
    const rows = await database.system
      .selectFrom('unanswered_questions')
      .selectAll()
      .where('id', '=', logged?.id ?? '')
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(rows)).not.toContain('asha');
    expect(JSON.stringify(rows)).not.toContain('9876543210');
  });

  it('cuts a very long question to 300 characters and ignores a text with nothing in it', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, `Is it ${'very '.repeat(100)}far?`);
    expect(await agentLogs(person, '   ')).toBeNull();
    expect(await agentLogs(person, '???')).toBeNull();
    const items = (await listUnanswered(person)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0].question.length).toBeLessThanOrEqual(300);
  });

  it('writes one activity-log line and one event for a new question only, holding ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const logged = await agentLogs(person, 'Secret Question 6644');
    await agentLogs(person, 'secret question 6644');
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', logged?.id ?? '')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'knowledge.unanswered_question_logged',
      record_type: 'unanswered_question',
      actor: { kind: 'agent', id: null },
    });
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'unanswered_question.logged')
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ unansweredQuestionId: logged?.id });
    expect(JSON.stringify([lines, events])).not.toContain('Secret');
    expect(JSON.stringify([lines, events])).not.toContain('6644');
  });
});

describe('GET /api/v1/knowledge/unanswered', () => {
  it('is an empty list for a business with nothing unanswered', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await listUnanswered(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('lists the most asked first, and the most recent first among equals', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'Asked once, long ago?');
    await agentLogs(person, 'Asked three times?');
    await agentLogs(person, 'Asked three times?');
    await agentLogs(person, 'Asked three times?');
    await agentLogs(person, 'Asked once, just now?');
    const items = (await listUnanswered(person)).json().items as Array<{ question: string; count: number }>;
    expect(items.map((item) => item.question)).toEqual([
      'Asked three times?',
      'Asked once, just now?',
      'Asked once, long ago?',
    ]);
  });

  it('shows only the open ones by default, and the answered and ignored ones too with include=history', async () => {
    const person = await createSignedInPerson(app, database);
    const open = await agentLogs(person, 'Open one?');
    const ignored = await agentLogs(person, 'Ignored one?');
    const answered = await agentLogs(person, 'Answered one?');
    const faqId = crypto.randomUUID();
    await database.system
      .insertInto('faqs')
      .values({ id: faqId, account_id: person.profile.business.id, question: 'Answered one?', answer: 'Yes.' })
      .execute();
    // What slice 4 will do: close the questions
    await database.system
      .updateTable('unanswered_questions')
      .set({ ignored_at: new Date() })
      .where('id', '=', ignored?.id ?? '')
      .execute();
    await database.system
      .updateTable('unanswered_questions')
      .set({ answered_at: new Date(), faq_id: faqId })
      .where('id', '=', answered?.id ?? '')
      .execute();

    const onlyOpen = (await listUnanswered(person)).json().items as Array<{ id: string }>;
    expect(onlyOpen.map((item) => item.id)).toEqual([open?.id]);
    const everything = (await listUnanswered(person, 'include=history')).json().items as Array<{
      id: string;
      status: string;
      faqId: string | null;
    }>;
    expect(everything).toHaveLength(3);
    expect(everything.find((item) => item.id === ignored?.id)?.status).toBe('ignored');
    expect(everything.find((item) => item.id === answered?.id)).toMatchObject({ status: 'answered', faqId });
  });

  it('never lists another business’s questions', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await agentLogs(first, 'Mine?');
    expect((await listUnanswered(second)).json().items).toEqual([]);
    expect((await listUnanswered(second, 'include=history')).json().items).toEqual([]);
  });

  it('is open to every role, 401 signed out, and 400 for an unknown include or query field', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listUnanswered(null)).statusCode).toBe(401);
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      expect((await listUnanswered(person)).statusCode, role).toBe(200);
    }
    expect((await listUnanswered(person, 'include=everything')).statusCode).toBe(400);
    expect((await listUnanswered(person, 'accountId=abc')).statusCode).toBe(400);
  });
});

describe('the unanswered_questions table', () => {
  it('refuses an answered question with no FAQ, an FAQ of another business, and a question both answered and ignored', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const logged = await agentLogs(person, 'Check the rules?');
    const othersFaqId = crypto.randomUUID();
    await database.system
      .insertInto('faqs')
      .values({ id: othersFaqId, account_id: other.profile.business.id, question: 'Theirs?', answer: 'Yes.' })
      .execute();
    const change = (values: { answered_at?: Date; faq_id?: string; ignored_at?: Date }) =>
      database.system
        .updateTable('unanswered_questions')
        .set(values)
        .where('id', '=', logged?.id ?? '')
        .execute();
    await expect(change({ answered_at: new Date() })).rejects.toThrow();
    await expect(change({ answered_at: new Date(), faq_id: othersFaqId })).rejects.toThrow();
    await expect(change({ ignored_at: new Date(), answered_at: new Date() })).rejects.toThrow();
  });
});
