import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { findBusinessIdentity } from '../src/modules/core/auth';
import { findBusinessKnowledgeForTheAgent } from '../src/modules/core/knowledge';
import { findWhatTheAgentMaySee } from '../src/modules/core/offerings';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// What the AI agent (F19) may know about a business: only confirmed answers, only offerings that are on, only offers that have not
// ended, and never another business's data.

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

/** Sends a request as the person, the way the web app does. */
const send = (person: SignedInPerson, method: 'POST' | 'PUT' | 'PATCH', url: string, payload: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    payload: payload as object,
  });

/** Reads what the agent may know about offerings and about the business, the way the agent's own code will. */
async function readWhatTheAgentKnows(person: SignedInPerson, now = new Date()) {
  const accountId = person.profile.business.id;
  return database.runInAccountTransaction(accountId, async (transaction) => {
    const identity = await findBusinessIdentity(transaction, accountId);
    if (!identity) throw new Error('The business should exist');
    return {
      identity,
      knowledge: await findBusinessKnowledgeForTheAgent(transaction, { accountId, industryId: identity.industry }),
      whatWeSell: await findWhatTheAgentMaySee(transaction, { accountId, timeZone: identity.timeZone, now }),
    };
  });
}

describe('what the AI agent may know about the offerings and offers', () => {
  it('knows the offerings that are on, with their price in words, and the offers that have not ended', async () => {
    const person = await createSignedInPerson(app, database);
    await send(person, 'POST', '/offerings', {
      name: 'Deluxe room',
      fromPricePaise: 400000,
      priceUnit: 'a night',
      gstMode: 'plus',
    });
    await send(person, 'POST', '/offers', { text: '10% off in December', endsOn: '2099-12-31' });
    const { whatWeSell } = await readWhatTheAgentKnows(person);
    expect(whatWeSell.offerings.map((offering) => offering.name)).toEqual(['Deluxe room']);
    expect(whatWeSell.offerings[0]?.priceInWords).toContain('₹4,000');
    expect(whatWeSell.offers).toEqual([{ text: '10% off in December', endsOn: '2099-12-31' }]);
  });

  it('does not know an offering that is switched off, or one that was removed, or an offer past its end date', async () => {
    const person = await createSignedInPerson(app, database);
    const accountId = person.profile.business.id;
    const off = (await send(person, 'POST', '/offerings', { name: 'Off room' })).json();
    await send(person, 'PATCH', `/offerings/${off.id}`, { active: false });
    await send(person, 'POST', '/offerings', { name: 'Live room' });
    await send(person, 'POST', '/offers', { text: 'Soon over', endsOn: '2099-01-01' });
    // An offer whose last day has passed is made by writing the date straight into the database (the app will not take a past date)
    await database.system
      .updateTable('offers')
      .set({ ends_on: '2020-01-01' })
      .where('account_id', '=', accountId)
      .execute();
    const { whatWeSell } = await readWhatTheAgentKnows(person);
    expect(whatWeSell.offerings.map((offering) => offering.name)).toEqual(['Live room']);
    expect(whatWeSell.offers).toEqual([]);
  });

  it('never shows another business’s offerings', async () => {
    const mine = await createSignedInPerson(app, database);
    const theirs = await createSignedInPerson(app, database);
    await send(theirs, 'POST', '/offerings', { name: 'Their secret room' });
    const { whatWeSell } = await readWhatTheAgentKnows(mine);
    expect(whatWeSell.offerings).toEqual([]);
  });
});

describe('what the AI agent may know about the business', () => {
  it('knows a confirmed answer in words, and the opening hours as data', async () => {
    const person = await createSignedInPerson(app, database);
    await send(person, 'PUT', '/knowledge/answers/address', { value: 'Fort Kochi, Kerala' });
    await send(person, 'PUT', '/knowledge/answers/opening_hours', { value: { allDay: true } });
    const { knowledge } = await readWhatTheAgentKnows(person);
    expect(knowledge.facts).toContainEqual({
      question: expect.stringMatching(/address/i),
      answer: 'Fort Kochi, Kerala',
    });
    expect(knowledge.facts.some((fact) => fact.answer === 'Open all day, every day.')).toBe(true);
    expect(knowledge.weeklyHours).toEqual({ allDay: true });
  });

  it('does not know an answer that is still waiting for a check', async () => {
    const person = await createSignedInPerson(app, database);
    await send(person, 'PUT', '/knowledge/answers/address', { value: 'Guessed address' });
    await database.system
      .updateTable('business_answers')
      .set({ status: 'check', confirmed_at: null })
      .where('account_id', '=', person.profile.business.id)
      .where('question_key', '=', 'address')
      .execute();
    const { knowledge } = await readWhatTheAgentKnows(person);
    expect(knowledge.facts.some((fact) => fact.answer === 'Guessed address')).toBe(false);
  });

  it('knows all seven situations, the ready-picked handling until the business chooses', async () => {
    const person = await createSignedInPerson(app, database);
    const before = await readWhatTheAgentKnows(person);
    expect(before.knowledge.situations).toHaveLength(7);
    const discountBefore = before.knowledge.situations.find((situation) => situation.key === 'discount_request');
    expect(discountBefore?.handlingKey).toBe('staff_call_with_best_price');
    await send(person, 'PUT', '/knowledge/situations/discount_request', { choice: 'prices_are_fixed' });
    const after = await readWhatTheAgentKnows(person);
    const discountAfter = after.knowledge.situations.find((situation) => situation.key === 'discount_request');
    expect(discountAfter).toMatchObject({ handlingKey: 'prices_are_fixed', handling: 'Prices are fixed' });
  });

  it('never shows another business’s answers', async () => {
    const mine = await createSignedInPerson(app, database);
    const theirs = await createSignedInPerson(app, database);
    await send(theirs, 'PUT', '/knowledge/answers/address', { value: 'Their private address' });
    const { knowledge } = await readWhatTheAgentKnows(mine);
    expect(knowledge.facts.some((fact) => fact.answer === 'Their private address')).toBe(false);
  });
});
