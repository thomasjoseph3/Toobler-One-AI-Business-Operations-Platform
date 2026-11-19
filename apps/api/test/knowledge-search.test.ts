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
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Adds an FAQ as the person and answers its id. */
async function addFaq(person: SignedInPerson, question: string, answer: string): Promise<string> {
  const response = await send(person, 'POST', '/knowledge/faqs', { question, answer });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().id;
}

/** Searches as the person. `text` is what the customer asked. */
const search = (person: SignedInPerson | null, text: string, extraQuery = '') =>
  send(person, 'GET', `/knowledge/search?q=${encodeURIComponent(text)}${extraQuery}`);

/** The questions of the FAQs a search found, in order. */
const foundQuestions = (response: { json: () => { items: Array<{ question: string }> } }) =>
  response.json().items.map((item) => item.question);

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('GET /api/v1/knowledge/search: finding the right FAQ', () => {
  it('finds an FAQ when the customer’s question shares a meaningful word, and says where it came from', async () => {
    const person = await createSignedInPerson(app, database);
    const faqId = await addFaq(person, 'Do you have parking?', 'Yes, free for guests.');
    await addFaq(person, 'Is breakfast included?', 'Yes, from 7 to 10 AM.');
    const response = await search(person, 'Is there any parking near the hotel for my car?');
    expect(response.statusCode, response.body).toBe(200);
    const items = response.json().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceKind: 'faq',
      sourceId: faqId,
      question: 'Do you have parking?',
      answer: 'Yes, free for guests.',
    });
    expect(items[0].score).toBeGreaterThan(0);
  });

  it('finds other forms of a word (park, parked, parking)', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, 'Do you have parking?', 'Yes.');
    expect(foundQuestions(await search(person, 'where can I park my car'))).toEqual(['Do you have parking?']);
    expect(foundQuestions(await search(person, 'my car will be parked overnight'))).toEqual(['Do you have parking?']);
  });

  it('finds a word that has a typo', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, 'Do you have parking?', 'Yes.');
    expect(foundQuestions(await search(person, 'parkng'))).toEqual(['Do you have parking?']);
  });

  it('finds an FAQ by a word that is only in its answer', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, 'What are the check-in rules?', 'Bring a passport or an Aadhaar card.');
    expect(foundQuestions(await search(person, 'do I need a passport'))).toEqual(['What are the check-in rules?']);
  });

  it('puts the question that matches best first', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, 'Is there a swimming pool?', 'Yes, on the roof.');
    await addFaq(person, 'Do you allow pets near the pool?', 'Not near the pool.');
    await addFaq(person, 'Do you have parking?', 'Yes.');
    const found = foundQuestions(await search(person, 'is there a swimming pool'));
    expect(found[0]).toBe('Is there a swimming pool?');
    expect(found).not.toContain('Do you have parking?');
  });

  it('gives an empty list when nothing matches, and for a question made only of filler words', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, 'Do you have parking?', 'Yes.');
    await addFaq(person, 'Is breakfast included?', 'Yes.');
    expect((await search(person, 'helicopter landing pad')).json()).toEqual({ items: [] });
    expect((await search(person, 'do you have')).json()).toEqual({ items: [] });
    expect((await search(person, '???')).json()).toEqual({ items: [] });
  });

  it('treats search text as plain words: quotes, operators and symbols cannot break the search', async () => {
    const person = await createSignedInPerson(app, database);
    await addFaq(person, 'Do you have parking?', 'Yes.');
    for (const text of ["parking'; drop table faqs; --", 'parking & | ! ( ) :*', '\\', 'park%ing_', '<->']) {
      const response = await search(person, text);
      expect(response.statusCode, text).toBe(200);
    }
  });

  it('gives at most the limit asked for (5 when not asked), best first', async () => {
    const person = await createSignedInPerson(app, database);
    for (let number = 1; number <= 7; number += 1) {
      await addFaq(person, `Do you have a room number ${number} with a balcony?`, 'Yes.');
    }
    expect((await search(person, 'balcony')).json().items).toHaveLength(5);
    expect((await search(person, 'balcony', '&limit=2')).json().items).toHaveLength(2);
    expect((await search(person, 'balcony', '&limit=10')).json().items).toHaveLength(7);
  });
});

describe('GET /api/v1/knowledge/search: only what the AI may use', () => {
  it('never finds a removed FAQ, and finds the FAQ’s new words after it is edited', async () => {
    const person = await createSignedInPerson(app, database);
    const removedId = await addFaq(person, 'Do you have a gym?', 'Yes.');
    const editedId = await addFaq(person, 'Do you have a sauna?', 'No.');
    await send(person, 'DELETE', `/knowledge/faqs/${removedId}`);
    expect((await search(person, 'gym')).json().items).toEqual([]);

    expect((await search(person, 'spa')).json().items).toEqual([]);
    await send(person, 'PATCH', `/knowledge/faqs/${editedId}`, { question: 'Do you have a spa?' });
    expect(foundQuestions(await search(person, 'spa'))).toEqual(['Do you have a spa?']);
    expect((await search(person, 'sauna')).json().items).toEqual([]);
  });

  it('never finds an FAQ that is waiting for a check (not yet accepted by the team)', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .insertInto('faqs')
      .values({
        id: crypto.randomUUID(),
        account_id: person.profile.business.id,
        question: 'Do you have a rooftop bar?',
        answer: 'Maybe.',
        status: 'check',
        source: 'website',
      })
      .execute();
    expect((await search(person, 'rooftop bar')).json().items).toEqual([]);
  });

  it('is found again when a question answered by an unanswered question becomes an FAQ', async () => {
    const person = await createSignedInPerson(app, database);
    const logged = await database.system
      .insertInto('unanswered_questions')
      .values({
        id: crypto.randomUUID(),
        account_id: person.profile.business.id,
        question: 'Is there EV charging?',
        group_key: 'is there ev charging',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    expect((await search(person, 'EV charging')).json().items).toEqual([]);
    await send(person, 'POST', `/knowledge/unanswered/${logged.id}/answer`, { answer: 'Yes, in the basement.' });
    expect(foundQuestions(await search(person, 'EV charging'))).toEqual(['Is there EV charging?']);
  });

  it('never finds another business’s FAQs', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await addFaq(first, 'Do you have a secret tunnel?', 'Only for us.');
    expect((await search(second, 'secret tunnel')).json().items).toEqual([]);
    expect(foundQuestions(await search(first, 'secret tunnel'))).toEqual(['Do you have a secret tunnel?']);
  });
});

describe('GET /api/v1/knowledge/search: asking correctly', () => {
  it('is 400 without text, with empty or too long text, with a limit out of range, and with fields it does not know', async () => {
    const person = await createSignedInPerson(app, database);
    const urls = [
      '/knowledge/search',
      '/knowledge/search?q=',
      '/knowledge/search?q=%20%20',
      `/knowledge/search?q=${'a'.repeat(301)}`,
      '/knowledge/search?q=parking&limit=0',
      '/knowledge/search?q=parking&limit=11',
      '/knowledge/search?q=parking&limit=many',
      '/knowledge/search?q=parking&accountId=abc',
    ];
    for (const url of urls) {
      expect((await send(person, 'GET', url)).statusCode, url).toBe(400);
    }
  });

  it('is 401 signed out and open to every role', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await search(null, 'parking')).statusCode).toBe(401);
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      expect((await search(person, 'parking')).statusCode, role).toBe(200);
    }
  });
});
