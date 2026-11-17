import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { createScriptedLlmProvider, type LlmScript } from '../src/providers/llm';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

// The business's own "call back within N minutes" (set in the setup wizard, step 8) is the number the AI agent promises.

let database: Database;
let app: FastifyInstance;
let script: LlmScript = () => ({ answer: 'Hello!' });
const pretendAiCompany = createScriptedLlmProvider((tried, request, messagesSoFar) => script(tried, request, messagesSoFar));

beforeAll(async () => {
  database = openTestDatabase();
  const config = { ...testConfig(), ai: { platformKeys: { gemini: [`promise-${randomUUID()}`], openai: [], anthropic: [] } } };
  app = await buildTestApp(database, [], { config, llmProvider: pretendAiCompany });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const send = (person: SignedInPerson, method: 'POST' | 'PUT', url: string, payload: unknown) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeRequestHeaders, cookie: person.cookieHeader },
    payload: payload as object,
  });

/** A business open all day that may use the platform's AI keys, with its callback promise set to the given minutes (or left alone). */
async function newBusiness(callbackPromiseMinutes?: number): Promise<SignedInPerson> {
  const person = await createSignedInPerson(app, database);
  await database.system
    .insertInto('ai_settings')
    .values({ account_id: person.profile.business.id, key_mode: 'platform', platform_enabled: true, platform_expires_at: null, task_models: {} })
    .execute();
  await send(person, 'PUT', '/knowledge/answers/opening_hours', { value: { allDay: true } });
  if (callbackPromiseMinutes !== undefined) {
    await send(person, 'PUT', '/knowledge/settings', { callbackPromiseMinutes });
  }
  return person;
}

/** A customer gives a phone number and the agent says what the system tells it to say. Answers the promise the turn recorded. */
async function promiseAfterCustomerGivesPhone(person: SignedInPerson) {
  script = (_tried, _request, messagesSoFar = []) => {
    const toolWasAnswered = messagesSoFar.some((message) => message.kind === 'tool_answer');
    return toolWasAnswered
      ? { answer: 'Thank you.' }
      : { answer: { toolCalls: [{ name: 'save_details', input: { name: 'Ravi', phone: '98470 12345' } }] } };
  };
  const response = await send(person, 'POST', '/agent/test-chat', { message: 'I am Ravi, 98470 12345' });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().promise as { kind: string; sentence: string; dueAt: string };
}

describe('the callback promise the agent makes', () => {
  it('is 15 minutes until the business changes it', async () => {
    const promise = await promiseAfterCustomerGivesPhone(await newBusiness());
    expect(promise).toMatchObject({ kind: 'call_back_open', sentence: 'Our team will call you within 15 minutes.' });
  });

  it("is the business's own number of minutes, in the words and in the due time", async () => {
    const before = Date.now();
    const promise = await promiseAfterCustomerGivesPhone(await newBusiness(45));
    expect(promise.sentence).toBe('Our team will call you within 45 minutes.');
    const dueAfterMinutes = (new Date(promise.dueAt).getTime() - before) / 60_000;
    expect(dueAfterMinutes).toBeGreaterThan(44);
    expect(dueAfterMinutes).toBeLessThan(46);
  });

  it("does not change another business's promise", async () => {
    const quick = await newBusiness(10);
    const normal = await newBusiness();
    expect((await promiseAfterCustomerGivesPhone(quick)).sentence).toContain('within 10 minutes');
    expect((await promiseAfterCustomerGivesPhone(normal)).sentence).toContain('within 15 minutes');
  });
});
