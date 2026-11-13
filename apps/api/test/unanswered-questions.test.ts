import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import knowledgeModule from '../src/modules/core/knowledge/module';
import { mergeSimilarQuestionsForBusiness } from '../src/modules/core/knowledge/services/unanswered-questions.service';
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

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (person: SignedInPerson | null, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Logs a question as the AI agent would and answers its id. */
async function askedQuestionId(person: SignedInPerson, text: string): Promise<string> {
  const logged = await agentLogs(person, text);
  if (!logged) throw new Error('The question was not saved');
  return logged.id;
}

describe('POST /api/v1/knowledge/unanswered/{id}/answer', () => {
  it('turns the question into a usable FAQ, closes the question as answered, and links the two', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Is there EV charging?');
    const response = await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, {
      answer: 'Yes, two chargers in the basement.',
    });
    expect(response.statusCode, response.body).toBe(201);
    const faq = response.json();
    expect(faq).toMatchObject({
      question: 'Is there EV charging?',
      answer: 'Yes, two chargers in the basement.',
      status: 'confirmed',
      source: 'unanswered',
    });
    // It is in the FAQ list now, and out of the open list but in the history
    const faqs = (await send(person, 'GET', '/knowledge/faqs')).json().items as Array<{ id: string }>;
    expect(faqs.map((item) => item.id)).toEqual([faq.id]);
    expect((await listUnanswered(person)).json().items).toEqual([]);
    const history = (await listUnanswered(person, 'include=history')).json().items;
    expect(history[0]).toMatchObject({ id: questionId, status: 'answered', faqId: faq.id });
  });

  it('uses the reworded question when one is sent, tidying its spaces', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'ev charger??');
    const response = await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, {
      question: '  Do you have   an EV charger? ',
      answer: 'Yes.',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().question).toBe('Do you have an EV charger?');
  });

  it('answers 409 FAQ_EXISTS when an FAQ already has the question, and leaves the question open', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Is there parking?');
    const existing = (
      await send(person, 'POST', '/knowledge/faqs', { question: 'is there parking', answer: 'Yes.' })
    ).json();
    // The FAQ has no question mark, so the two differ: make them the same
    await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, {
      answer: 'Yes.',
      question: 'is there parking',
    }).then((response) => {
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: 'FAQ_EXISTS', details: { faqId: existing.id } } });
    });
    expect((await listUnanswered(person)).json().items).toHaveLength(1);
    expect((await send(person, 'GET', '/knowledge/faqs')).json().items).toHaveLength(1);
  });

  it('answers 409 UNANSWERED_QUESTION_NOT_OPEN the second time, and for an ignored question', async () => {
    const person = await createSignedInPerson(app, database);
    const answeredId = await askedQuestionId(person, 'First?');
    const ignoredId = await askedQuestionId(person, 'Second?');
    expect(
      (await send(person, 'POST', `/knowledge/unanswered/${answeredId}/answer`, { answer: 'One.' })).statusCode,
    ).toBe(201);
    await send(person, 'POST', `/knowledge/unanswered/${ignoredId}/dismiss`);
    for (const id of [answeredId, ignoredId]) {
      const response = await send(person, 'POST', `/knowledge/unanswered/${id}/answer`, { answer: 'Again.' });
      expect(response.statusCode, id).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: 'UNANSWERED_QUESTION_NOT_OPEN' } });
    }
    expect((await send(person, 'GET', '/knowledge/faqs')).json().items).toHaveLength(1);
  });

  it('makes only one FAQ when two people answer at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Race?');
    const responses = await Promise.all([
      send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, { answer: 'A.' }),
      send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, { answer: 'B.' }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect((await send(person, 'GET', '/knowledge/faqs')).json().items).toHaveLength(1);
  });

  it('is 400 for a missing or empty answer, a too long text and fields it does not know', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Bad body?');
    const bodies = [
      {},
      { answer: '   ' },
      { answer: 'a'.repeat(2001) },
      { answer: 'Yes.', question: '   ' },
      { answer: 'Yes.', question: 'q'.repeat(301) },
      { answer: 'Yes.', status: 'check' },
      { answer: 'Yes.', faqId: crypto.randomUUID() },
    ];
    for (const body of bodies) {
      const response = await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    expect((await listUnanswered(person)).json().items).toHaveLength(1);
  });

  it('is 404 for an unknown id and another business’s question (which stays open), and 400 for an id that is not an id', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const othersQuestionId = await askedQuestionId(other, 'Theirs?');
    for (const id of [crypto.randomUUID(), othersQuestionId]) {
      expect((await send(person, 'POST', `/knowledge/unanswered/${id}/answer`, { answer: 'Hi.' })).statusCode, id).toBe(
        404,
      );
    }
    expect((await send(person, 'POST', '/knowledge/unanswered/not-an-id/answer', { answer: 'Hi.' })).statusCode).toBe(
      400,
    );
    expect((await listUnanswered(other)).json().items).toHaveLength(1);
    expect((await send(other, 'GET', '/knowledge/faqs')).json().items).toEqual([]);
  });

  it('is 401 signed out and open to every role', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Who may answer?');
    expect((await send(null, 'POST', `/knowledge/unanswered/${questionId}/answer`, { answer: 'x' })).statusCode).toBe(
      401,
    );
    await setRole(person, 'staff_own');
    const response = await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, { answer: 'Anyone.' });
    expect(response.statusCode, response.body).toBe(201);
  });

  it('writes log lines and events holding ids only, never the words', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Secret Question 3377');
    const faq = (
      await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, { answer: 'Secret Answer 5599' })
    ).json();
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', 'in', [questionId, faq.id])
      .execute();
    expect(lines.map((line) => line.kind).sort()).toEqual([
      'knowledge.faq_created',
      'knowledge.unanswered_question_answered',
      'knowledge.unanswered_question_logged',
    ]);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'unanswered_question.answered')
      .execute();
    expect(events.map((event) => event.payload)).toEqual([{ unansweredQuestionId: questionId, faqId: faq.id }]);
    expect(JSON.stringify([lines, events])).not.toContain('Secret');
    expect(JSON.stringify([lines, events])).not.toContain('3377');
  });
});

describe('POST /api/v1/knowledge/unanswered/{id}/dismiss', () => {
  it('takes the question off the open list and keeps it in the history as ignored', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Not worth answering?');
    const response = await send(person, 'POST', `/knowledge/unanswered/${questionId}/dismiss`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ id: questionId, status: 'ignored', faqId: null });
    expect((await listUnanswered(person)).json().items).toEqual([]);
    expect((await listUnanswered(person, 'include=history')).json().items[0]).toMatchObject({ status: 'ignored' });
  });

  it('keeps counting when an ignored question is asked again, but it stays ignored', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Ignore me?');
    await send(person, 'POST', `/knowledge/unanswered/${questionId}/dismiss`);
    await agentLogs(person, 'ignore me');
    expect((await listUnanswered(person)).json().items).toEqual([]);
    expect((await listUnanswered(person, 'include=history')).json().items[0]).toMatchObject({
      status: 'ignored',
      count: 2,
    });
  });

  it('answers 409 UNANSWERED_QUESTION_NOT_OPEN the second time and for an answered question', async () => {
    const person = await createSignedInPerson(app, database);
    const ignoredId = await askedQuestionId(person, 'One?');
    const answeredId = await askedQuestionId(person, 'Two?');
    await send(person, 'POST', `/knowledge/unanswered/${ignoredId}/dismiss`);
    await send(person, 'POST', `/knowledge/unanswered/${answeredId}/answer`, { answer: 'Yes.' });
    for (const id of [ignoredId, answeredId]) {
      const response = await send(person, 'POST', `/knowledge/unanswered/${id}/dismiss`);
      expect(response.statusCode, id).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: 'UNANSWERED_QUESTION_NOT_OPEN' } });
    }
  });

  it('is 404 for an unknown id and another business’s question (which stays open), and 400 for an id that is not an id', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const othersQuestionId = await askedQuestionId(other, 'Theirs?');
    for (const id of [crypto.randomUUID(), othersQuestionId]) {
      expect((await send(person, 'POST', `/knowledge/unanswered/${id}/dismiss`)).statusCode, id).toBe(404);
    }
    expect((await send(person, 'POST', '/knowledge/unanswered/not-an-id/dismiss')).statusCode).toBe(400);
    expect((await listUnanswered(other)).json().items).toHaveLength(1);
  });

  it('is 401 signed out and open to every role', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Who may ignore?');
    expect((await send(null, 'POST', `/knowledge/unanswered/${questionId}/dismiss`)).statusCode).toBe(401);
    await setRole(person, 'staff');
    expect((await send(person, 'POST', `/knowledge/unanswered/${questionId}/dismiss`)).statusCode).toBe(200);
  });

  it('writes a log line and an event holding ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Secret Question 8181');
    await send(person, 'POST', `/knowledge/unanswered/${questionId}/dismiss`);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', questionId)
      .where('kind', '=', 'knowledge.unanswered_question_ignored')
      .executeTakeFirstOrThrow();
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'unanswered_question.ignored')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ unansweredQuestionId: questionId });
    expect(JSON.stringify([line, event])).not.toContain('Secret');
  });
});

describe('removing an FAQ that answered a question', () => {
  it('opens the question again, so the team can answer it better', async () => {
    const person = await createSignedInPerson(app, database);
    const questionId = await askedQuestionId(person, 'Is there a pool?');
    const faq = (await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, { answer: 'No.' })).json();
    expect((await listUnanswered(person)).json().items).toEqual([]);
    expect((await send(person, 'DELETE', `/knowledge/faqs/${faq.id}`)).statusCode).toBe(204);
    const open = (await listUnanswered(person)).json().items;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: questionId, status: 'open', faqId: null });
    // And it can be answered again
    const again = await send(person, 'POST', `/knowledge/unanswered/${questionId}/answer`, {
      answer: 'Yes, new pool.',
    });
    expect(again.statusCode, again.body).toBe(201);
  });
});

/** Runs the nightly clean-up for the person's business, as the job does. Returns how many questions were joined into others. */
const runNightlyMerge = (person: SignedInPerson) =>
  mergeSimilarQuestionsForBusiness(
    createContextFactory(database)(person.profile.business.id, {
      kind: 'system',
      id: 'knowledge.merge_similar_questions_for_business',
    }),
  );

describe('the nightly clean-up that joins the same question asked in different words', () => {
  it('joins questions with the same meaningful words into the most asked one, with the full count', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'Is parking available?');
    await agentLogs(person, 'Available parking?');
    await agentLogs(person, 'available parking');
    await agentLogs(person, 'Is there parking available');
    const keeperId = await askedQuestionId(person, 'Parking, available?');
    expect((await listUnanswered(person)).json().items).toHaveLength(4); // four different wordings so far
    expect(await runNightlyMerge(person)).toBe(3);
    const items = (await listUnanswered(person)).json().items;
    expect(items).toHaveLength(1);
    // The most asked wording stays ("Available parking?" was asked twice) and carries the full count of 5
    expect(items[0]).toMatchObject({ question: 'Available parking?', count: 5, status: 'open' });
    expect(items[0].id).not.toBe(keeperId);
  });

  it('never joins different questions, such as two room numbers, or answered and ignored ones', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'What is the price of room 101?');
    await agentLogs(person, 'What is the price of room 102?');
    const ignoredId = await askedQuestionId(person, 'Pool open late?');
    await send(person, 'POST', `/knowledge/unanswered/${ignoredId}/dismiss`);
    await agentLogs(person, 'Is the pool open late');
    expect(await runNightlyMerge(person)).toBe(0);
    expect((await listUnanswered(person)).json().items).toHaveLength(3);
  });

  it('is safe to run twice: the second run finds nothing to join', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'Is parking available?');
    await agentLogs(person, 'Available parking?');
    expect(await runNightlyMerge(person)).toBe(1);
    expect(await runNightlyMerge(person)).toBe(0);
    expect((await listUnanswered(person)).json().items).toHaveLength(1);
  });

  it('counts a joined question asked again on the question it was joined into', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'Is parking available?');
    await agentLogs(person, 'Available parking?');
    await agentLogs(person, 'Available parking?');
    await runNightlyMerge(person); // "Available parking?" stays with a count of 3
    const asked = await agentLogs(person, 'is parking available');
    expect(asked?.count).toBe(4);
    const items = (await listUnanswered(person)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(4);
  });

  it('hides joined questions everywhere, so they cannot be answered or ignored by an old id', async () => {
    const person = await createSignedInPerson(app, database);
    const joinedId = await askedQuestionId(person, 'Is parking available?');
    await agentLogs(person, 'Available parking?');
    await agentLogs(person, 'Available parking?');
    await runNightlyMerge(person);
    const history = (await listUnanswered(person, 'include=history')).json().items as Array<{ id: string }>;
    expect(history.map((item) => item.id)).not.toContain(joinedId);
    expect(
      (await send(person, 'POST', `/knowledge/unanswered/${joinedId}/answer`, { answer: 'Yes.' })).statusCode,
    ).toBe(404);
    expect((await send(person, 'POST', `/knowledge/unanswered/${joinedId}/dismiss`)).statusCode).toBe(404);
  });

  it('keeps answering working on the question that stays', async () => {
    const person = await createSignedInPerson(app, database);
    await agentLogs(person, 'Is parking available?');
    await agentLogs(person, 'Available parking?');
    await runNightlyMerge(person);
    const keeper = (await listUnanswered(person)).json().items[0];
    const answered = await send(person, 'POST', `/knowledge/unanswered/${keeper.id}/answer`, { answer: 'Yes.' });
    expect(answered.statusCode, answered.body).toBe(201);
  });

  it('leaves another business’s questions alone, and writes log lines holding ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    await agentLogs(person, 'Secret Parking 4412 available?');
    await agentLogs(person, 'Available secret parking 4412');
    await agentLogs(other, 'Is parking available?');
    await agentLogs(other, 'Available parking?');
    await runNightlyMerge(person);
    expect((await listUnanswered(other)).json().items).toHaveLength(2);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'knowledge.unanswered_questions_merged')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      record_type: 'unanswered_question',
      actor: { kind: 'system', id: 'knowledge.merge_similar_questions_for_business' },
    });
    expect(JSON.stringify(lines)).not.toContain('Secret');
    expect(JSON.stringify(lines)).not.toContain('4412');
  });

  it('is declared by the knowledge module as a nightly job that queues one clean-up per business', async () => {
    const nightly = knowledgeModule.jobs?.find((job) => job.name === 'knowledge.merge_similar_questions');
    expect(nightly?.schedule).toBe('30 2 * * *');
    const queued: Array<{ name: string; data: unknown }> = [];
    await nightly?.run({
      data: {},
      accountContext: undefined,
      enqueueJob: async (name, data) => {
        queued.push({ name, data });
      },
      listAccountIds: async () => ['11111111-1111-7111-8111-111111111111', '22222222-2222-7222-8222-222222222222'],
      logger: console as never,
    });
    expect(queued).toEqual([
      {
        name: 'knowledge.merge_similar_questions_for_business',
        data: { accountId: '11111111-1111-7111-8111-111111111111' },
      },
      {
        name: 'knowledge.merge_similar_questions_for_business',
        data: { accountId: '22222222-2222-7222-8222-222222222222' },
      },
    ]);
    const perBusiness = knowledgeModule.jobs?.find(
      (job) => job.name === 'knowledge.merge_similar_questions_for_business',
    );
    expect(perBusiness?.schedule).toBeUndefined();
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
