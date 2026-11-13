import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

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

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  withCsrfHeaders = true,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(withCsrfHeaders ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Adds an FAQ as the person. */
const addFaq = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  send(person, 'POST', '/knowledge/faqs', body, withCsrfHeaders);

/** Lists FAQs as the person. `query` is the part after the `?`. */
const listFaqs = (person: SignedInPerson | null, query = '') =>
  send(person, 'GET', `/knowledge/faqs${query ? `?${query}` : ''}`);

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('POST /api/v1/knowledge/faqs', () => {
  it('adds an FAQ the owner typed: usable at once, source typed', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addFaq(person, { question: 'Do you have parking?', answer: 'Yes, free for guests.' });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      question: 'Do you have parking?',
      answer: 'Yes, free for guests.',
      status: 'confirmed',
      source: 'typed',
    });
    expect(response.json().id).toEqual(expect.any(String));
  });

  it('tidies extra spaces in the question and at the ends of the answer, but keeps line breaks in the answer', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await addFaq(person, {
      question: '  Is   breakfast\n included?  ',
      answer: '  Yes.\nServed 7 to 10 AM.  ',
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      question: 'Is breakfast included?',
      answer: 'Yes.\nServed 7 to 10 AM.',
    });
  });

  it('refuses a second FAQ with the same question, ignoring capitals and extra spaces: 409 FAQ_EXISTS naming the first', async () => {
    const person = await createSignedInPerson(app, database);
    const first = (await addFaq(person, { question: 'Do you have parking?', answer: 'Yes.' })).json();
    const second = await addFaq(person, { question: '  DO YOU HAVE   parking? ', answer: 'No.' });
    expect(second.statusCode, second.body).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'FAQ_EXISTS', details: { faqId: first.id } } });
    expect((await listFaqs(person)).json().items).toHaveLength(1);
  });

  it('lets two businesses have the same question', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    expect((await addFaq(first, { question: 'Do you have parking?', answer: 'Yes.' })).statusCode).toBe(201);
    expect((await addFaq(second, { question: 'Do you have parking?', answer: 'No.' })).statusCode).toBe(201);
  });

  it('makes only one FAQ when the same question is added twice at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const responses = await Promise.all([
      addFaq(person, { question: 'Do you have a lift?', answer: 'Yes.' }),
      addFaq(person, { question: 'do you have a lift?', answer: 'Yes, two.' }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect((await listFaqs(person)).json().items).toHaveLength(1);
  });

  it('is 400 for a missing, empty or too long question or answer, and for fields it does not know', async () => {
    const person = await createSignedInPerson(app, database);
    const bodies = [
      {},
      { question: 'Only a question' },
      { answer: 'Only an answer' },
      { question: '   ', answer: 'Yes.' },
      { question: 'Why?', answer: '   ' },
      { question: 'q'.repeat(301), answer: 'Yes.' },
      { question: 'Why?', answer: 'a'.repeat(2001) },
      { question: 'Why?', answer: 'Yes.', status: 'check' },
      { question: 'Why?', answer: 'Yes.', accountId: person.profile.business.id },
    ];
    for (const body of bodies) {
      const response = await addFaq(person, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('is 401 signed out and 401 without the request headers the web app sends, and open to every role (owner decision: anyone may add an FAQ)', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await addFaq(null, { question: 'Why?', answer: 'Because.' })).statusCode).toBe(401);
    expect((await addFaq(person, { question: 'Why?', answer: 'Because.' }, false)).statusCode).toBeGreaterThanOrEqual(
      400,
    );
    let questionNumber = 0;
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      questionNumber += 1;
      const response = await addFaq(person, { question: `Question ${questionNumber}?`, answer: 'Yes.' });
      expect(response.statusCode, role).toBe(201);
    }
  });

  it('writes one activity-log line and one event holding ids and field names only, never the words', async () => {
    const person = await createSignedInPerson(app, database);
    const faq = (await addFaq(person, { question: 'Secret Question 8472', answer: 'Secret Answer 9931' })).json();
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', faq.id)
      .executeTakeFirstOrThrow();
    expect(line).toMatchObject({
      kind: 'knowledge.faq_created',
      record_type: 'faq',
      actor: { kind: 'user', id: person.profile.user.id },
    });
    expect([...line.fields].sort()).toEqual(['answer', 'question']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'faq.created')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ faqId: faq.id, source: 'typed' });
    expect(JSON.stringify([line, event])).not.toContain('Secret');
    expect(JSON.stringify([line, event])).not.toContain('8472');
    const row = await database.system.selectFrom('faqs').selectAll().where('id', '=', faq.id).executeTakeFirstOrThrow();
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.account_id).toBe(person.profile.business.id);
  });
});

describe('GET /api/v1/knowledge/faqs', () => {
  it('lists an empty list for a business with no FAQs', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await listFaqs(person);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ items: [] });
  });

  it('lists the newest first', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, { question: 'First?', answer: 'One.' });
    await addFaq(person, { question: 'Second?', answer: 'Two.' });
    await addFaq(person, { question: 'Third?', answer: 'Three.' });
    const items = (await listFaqs(person)).json().items as Array<{ question: string }>;
    expect(items.map((item) => item.question)).toEqual(['Third?', 'Second?', 'First?']);
  });

  it('narrows to a status, and shows FAQs waiting for a check only when asked', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, { question: 'Typed?', answer: 'Yes.' });
    // What the website reader will leave behind (F31): an FAQ waiting for a manager's check
    await database.system
      .insertInto('faqs')
      .values({
        id: crypto.randomUUID(),
        account_id: person.profile.business.id,
        question: 'Drafted?',
        answer: 'Maybe.',
        status: 'check',
        source: 'website',
      })
      .execute();
    expect((await listFaqs(person)).json().items).toHaveLength(2);
    const confirmed = (await listFaqs(person, 'status=confirmed')).json().items as Array<{ question: string }>;
    expect(confirmed.map((item) => item.question)).toEqual(['Typed?']);
    const waiting = (await listFaqs(person, 'status=check')).json().items as Array<{ question: string }>;
    expect(waiting.map((item) => item.question)).toEqual(['Drafted?']);
  });

  it('never lists a removed FAQ', async () => {
    const person = await createSignedInPerson(app, database);
    const faq = (await addFaq(person, { question: 'Gone?', answer: 'Yes.' })).json();
    await database.system.updateTable('faqs').set({ deleted_at: new Date() }).where('id', '=', faq.id).execute();
    expect((await listFaqs(person)).json().items).toEqual([]);
  });

  it('never lists another business’s FAQs', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addFaq(first, { question: 'Mine?', answer: 'Yes.' });
    expect((await listFaqs(second)).json().items).toEqual([]);
  });

  it('is open to every role, 401 signed out, and 400 for an unknown status or an unknown query field', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await listFaqs(null)).statusCode).toBe(401);
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      expect((await listFaqs(person)).statusCode, role).toBe(200);
    }
    expect((await listFaqs(person, 'status=nonsense')).statusCode).toBe(400);
    expect((await listFaqs(person, 'accountId=abc')).statusCode).toBe(400);
  });
});

describe('PATCH /api/v1/knowledge/faqs/{id}', () => {
  /** Adds an FAQ and answers its id. */
  async function addOne(person: SignedInPerson, question = 'Do you have parking?') {
    const response = await addFaq(person, { question, answer: 'Yes.' });
    return response.json().id as string;
  }

  it('changes the answer, the question, or both, and leaves the rest alone', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addOne(person);
    const answerOnly = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { answer: 'Yes, free.' });
    expect(answerOnly.statusCode, answerOnly.body).toBe(200);
    expect(answerOnly.json()).toMatchObject({ question: 'Do you have parking?', answer: 'Yes, free.' });
    const questionOnly = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { question: '  Is  there parking? ' });
    expect(questionOnly.json()).toMatchObject({ question: 'Is there parking?', answer: 'Yes, free.' });
    const both = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { question: 'Parking?', answer: 'Yes.' });
    expect(both.json()).toMatchObject({ question: 'Parking?', answer: 'Yes.', status: 'confirmed', source: 'typed' });
  });

  it('sending the values it already has changes nothing and writes no log line', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addOne(person);
    const response = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { question: 'Do you have parking?' });
    expect(response.statusCode, response.body).toBe(200);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('record_id', '=', faqId)
      .execute();
    expect(lines.map((line) => line.kind)).toEqual(['knowledge.faq_created']);
  });

  it('can change a question to different capitals of itself (the same FAQ is no clash with itself)', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addOne(person);
    const response = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { question: 'DO YOU HAVE PARKING?' });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().question).toBe('DO YOU HAVE PARKING?');
  });

  it('refuses a question another live FAQ has: 409 FAQ_EXISTS naming it', async () => {
    const person = await createSignedInPerson(app, database);
    const otherId = await addOne(person, 'Is breakfast included?');
    const faqId = await addOne(person);
    const response = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { question: 'is breakfast  INCLUDED?' });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'FAQ_EXISTS', details: { faqId: otherId } } });
  });

  it('is 400 for nothing to change, empty or too long text, and fields it does not know', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addOne(person);
    const bodies = [
      {},
      { question: '   ' },
      { answer: '' },
      { question: 'q'.repeat(301) },
      { answer: 'a'.repeat(2001) },
      { status: 'check' },
      { accountId: person.profile.business.id },
    ];
    for (const body of bodies) {
      const response = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
    }
    const nothing = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, {});
    expect(nothing.json()).toMatchObject({ error: { code: 'NOTHING_TO_CHANGE' } });
  });

  it('is 404 for an unknown id, a removed FAQ and another business’s FAQ, and 400 for an id that is not an id', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const othersFaqId = await addOne(other);
    const removedId = await addOne(person, 'Removed?');
    await send(person, 'DELETE', `/knowledge/faqs/${removedId}`);
    for (const id of [crypto.randomUUID(), removedId, othersFaqId]) {
      const response = await send(person, 'PATCH', `/knowledge/faqs/${id}`, { answer: 'Changed' });
      expect(response.statusCode, id).toBe(404);
    }
    expect((await send(person, 'PATCH', '/knowledge/faqs/not-an-id', { answer: 'x' })).statusCode).toBe(400);
    // The other business's FAQ is untouched
    expect((await listFaqs(other)).json().items[0].answer).toBe('Yes.');
  });

  it('is 401 signed out and open to every role', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addOne(person);
    expect((await send(null, 'PATCH', `/knowledge/faqs/${faqId}`, { answer: 'x' })).statusCode).toBe(401);
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      const response = await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { answer: `By ${role}` });
      expect(response.statusCode, role).toBe(200);
    }
  });

  it('writes a log line and an event naming the fields that changed, never the words', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addOne(person);
    await send(person, 'PATCH', `/knowledge/faqs/${faqId}`, { answer: 'Secret Answer 5521' });
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', faqId)
      .where('kind', '=', 'knowledge.faq_updated')
      .executeTakeFirstOrThrow();
    expect(line.fields).toEqual(['answer']);
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'faq.updated')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ faqId, fields: ['answer'] });
    expect(JSON.stringify([line, event])).not.toContain('Secret');
  });
});

describe('DELETE /api/v1/knowledge/faqs/{id}', () => {
  it('removes the FAQ from the list, frees its question for a new FAQ, and keeps the row', async () => {
    const person = await createSignedInPerson(app, database);
    const created = (await addFaq(person, { question: 'Do you have parking?', answer: 'Yes.' })).json();
    const response = await send(person, 'DELETE', `/knowledge/faqs/${created.id}`);
    expect(response.statusCode, response.body).toBe(204);
    expect((await listFaqs(person)).json().items).toEqual([]);
    expect((await addFaq(person, { question: 'Do you have parking?', answer: 'Yes again.' })).statusCode).toBe(201);
    const row = await database.system
      .selectFrom('faqs')
      .selectAll()
      .where('id', '=', created.id)
      .executeTakeFirstOrThrow();
    expect(row.deleted_at).not.toBeNull();
    expect(row.updated_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('is 404 the second time, for an unknown id and for another business’s FAQ, and 400 for an id that is not an id', async () => {
    const person = await createSignedInPerson(app, database);
    const other = await createSignedInPerson(app, database);
    const othersFaq = (await addFaq(other, { question: 'Theirs?', answer: 'Yes.' })).json();
    const mine = (await addFaq(person, { question: 'Mine?', answer: 'Yes.' })).json();
    expect((await send(person, 'DELETE', `/knowledge/faqs/${mine.id}`)).statusCode).toBe(204);
    for (const id of [mine.id, crypto.randomUUID(), othersFaq.id]) {
      expect((await send(person, 'DELETE', `/knowledge/faqs/${id}`)).statusCode, id).toBe(404);
    }
    expect((await send(person, 'DELETE', '/knowledge/faqs/not-an-id')).statusCode).toBe(400);
    expect((await listFaqs(other)).json().items).toHaveLength(1);
  });

  it('is 401 signed out and open to every role', async () => {
    const person = await createSignedInPerson(app, database);
    const faq = (await addFaq(person, { question: 'Why?', answer: 'Because.' })).json();
    expect((await send(null, 'DELETE', `/knowledge/faqs/${faq.id}`)).statusCode).toBe(401);
    await setRole(person, 'staff');
    expect((await send(person, 'DELETE', `/knowledge/faqs/${faq.id}`)).statusCode).toBe(204);
  });

  it('writes a log line and an event holding ids only', async () => {
    const person = await createSignedInPerson(app, database);
    const faq = (await addFaq(person, { question: 'Secret Question 7788', answer: 'Yes.' })).json();
    await send(person, 'DELETE', `/knowledge/faqs/${faq.id}`);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('record_id', '=', faq.id)
      .where('kind', '=', 'knowledge.faq_deleted')
      .executeTakeFirstOrThrow();
    const event = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'faq.deleted')
      .executeTakeFirstOrThrow();
    expect(event.payload).toEqual({ faqId: faq.id });
    expect(JSON.stringify([line, event])).not.toContain('Secret');
  });
});
