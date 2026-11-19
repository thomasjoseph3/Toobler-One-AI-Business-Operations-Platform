import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createRecordingWhatsappProvider, switchOnWhatsapp } from './support/whatsapp';

let database: Database;
let app: FastifyInstance;
let numberCheck: () => Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }>;

beforeAll(async () => {
  database = openTestDatabase();
  numberCheck = async () => ({ displayPhoneNumber: '+919847012345', verifiedName: 'Nair Stays' });
  const { provider } = createRecordingWhatsappProvider({ numberCheck: () => numberCheck() });
  app = await buildTestApp(database, [], { whatsappProvider: provider });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/v1/channels/whatsapp${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** A phone number id nobody else uses, so tests never collide. */
const newNumberId = () => String(Math.floor(10_000_000_000 + Math.random() * 80_000_000_000));

async function newBusinessWithWhatsapp() {
  const person = await createSignedInPerson(app, database);
  await switchOnWhatsapp(database, person.profile.business.id);
  return person;
}

describe('GET /api/v1/channels/whatsapp', () => {
  it('shows no connection yet, with the webhook address and verify token to give Meta', async () => {
    const person = await newBusinessWithWhatsapp();
    const response = await send(person, 'GET', '');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      connection: null,
      platformReady: true,
      verifyToken: 'test-meta-verify-token',
      webhookUrl: expect.stringMatching(/\/webhooks\/whatsapp$/),
    });
  });
  it('answers 401 without signing in', async () => {
    expect((await send(null, 'GET', '')).statusCode).toBe(401);
  });
  it('answers 403 to a person who is not a manager', async () => {
    const owner = await newBusinessWithWhatsapp();
    const staff = await createSignedInPerson(app, database);
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', staff.profile.user.id).execute();
    await switchOnWhatsapp(database, staff.profile.business.id);
    expect((await send(staff, 'GET', '')).statusCode).toBe(403);
    expect(owner).toBeDefined();
  });
  it('answers 404 while WhatsApp is not in the business’s plan', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await send(person, 'GET', '')).statusCode).toBe(404);
  });
});

describe('PUT /api/v1/channels/whatsapp', () => {
  it('connects a number and never shows the token again, only its last four characters', async () => {
    const person = await newBusinessWithWhatsapp();
    const phoneNumberId = newNumberId();
    const response = await send(person, 'PUT', '', {
      phoneNumberId,
      accessToken: 'EAAB-secret-token-1234',
      businessAccountId: '99887766554',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      phoneNumberId,
      tokenPreview: '••••1234',
      status: 'unchecked',
      answerMessages: true,
    });
    expect(response.body).not.toContain('secret-token');
    const stored = await database.system
      .selectFrom('whatsapp_connections')
      .select('encrypted_access_token')
      .where('account_id', '=', person.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(stored.encrypted_access_token).toMatch(/^v1\./);
    expect(stored.encrypted_access_token).not.toContain('secret-token');
  });
  it('keeps the saved token when only a setting changes, and pauses the AI when asked', async () => {
    const person = await newBusinessWithWhatsapp();
    const phoneNumberId = newNumberId();
    await send(person, 'PUT', '', { phoneNumberId, accessToken: 'EAAB-secret-token-1234' });
    const response = await send(person, 'PUT', '', { phoneNumberId, answerMessages: false });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ tokenPreview: '••••1234', answerMessages: false });
  });
  it('answers 400 TOKEN_NEEDED for a first connection without a token, and 400 for a bad number id', async () => {
    const person = await newBusinessWithWhatsapp();
    const noToken = await send(person, 'PUT', '', { phoneNumberId: newNumberId() });
    expect(noToken.statusCode).toBe(400);
    expect(noToken.json().error.code).toBe('TOKEN_NEEDED');
    expect(
      (await send(person, 'PUT', '', { phoneNumberId: 'abc', accessToken: 'EAAB-secret-token-1234' })).statusCode,
    ).toBe(400);
  });
  it('answers 409 NUMBER_IN_USE when another business has the number', async () => {
    const first = await newBusinessWithWhatsapp();
    const second = await newBusinessWithWhatsapp();
    const phoneNumberId = newNumberId();
    expect((await send(first, 'PUT', '', { phoneNumberId, accessToken: 'EAAB-secret-token-1234' })).statusCode).toBe(
      200,
    );
    const response = await send(second, 'PUT', '', { phoneNumberId, accessToken: 'EAAB-other-token-9999' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NUMBER_IN_USE');
  });
  it('answers 401 and 403 and 404 like the other routes', async () => {
    const body = { phoneNumberId: newNumberId(), accessToken: 'EAAB-secret-token-1234' };
    expect((await send(null, 'PUT', '', body)).statusCode).toBe(401);
    const staff = await createSignedInPerson(app, database);
    await switchOnWhatsapp(database, staff.profile.business.id);
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', staff.profile.user.id).execute();
    expect((await send(staff, 'PUT', '', body)).statusCode).toBe(403);
    const notInPlan = await createSignedInPerson(app, database);
    expect((await send(notInPlan, 'PUT', '', body)).statusCode).toBe(404);
  });
});

describe('POST /api/v1/channels/whatsapp/check', () => {
  it('asks Meta and keeps the answer: working with the number, or failed with Meta’s reason', async () => {
    const person = await newBusinessWithWhatsapp();
    await send(person, 'PUT', '', { phoneNumberId: newNumberId(), accessToken: 'EAAB-secret-token-1234' });
    const working = await send(person, 'POST', '/check');
    expect(working.statusCode, working.body).toBe(200);
    expect(working.json()).toMatchObject({
      ok: true,
      connection: { status: 'working', displayPhoneNumber: '+919847012345' },
    });
    expect(working.json().connection.chatLink).toBe('https://wa.me/919847012345');

    numberCheck = async () => {
      throw new Error('Invalid OAuth access token.');
    };
    const failed = await send(person, 'POST', '/check');
    expect(failed.json()).toMatchObject({
      ok: false,
      note: 'Invalid OAuth access token.',
      connection: { status: 'failed' },
    });
    numberCheck = async () => ({ displayPhoneNumber: '+919847012345', verifiedName: 'Nair Stays' });
  });
  it('answers 404 with no connection, 401 signed out, 403 for staff', async () => {
    const person = await newBusinessWithWhatsapp();
    expect((await send(person, 'POST', '/check')).statusCode).toBe(404);
    expect((await send(null, 'POST', '/check')).statusCode).toBe(401);
    const staff = await createSignedInPerson(app, database);
    await switchOnWhatsapp(database, staff.profile.business.id);
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', staff.profile.user.id).execute();
    expect((await send(staff, 'POST', '/check')).statusCode).toBe(403);
  });
});

describe('DELETE /api/v1/channels/whatsapp', () => {
  it('removes the connection and the saved token', async () => {
    const person = await newBusinessWithWhatsapp();
    await send(person, 'PUT', '', { phoneNumberId: newNumberId(), accessToken: 'EAAB-secret-token-1234' });
    expect((await send(person, 'DELETE', '')).statusCode).toBe(204);
    expect((await send(person, 'GET', '')).json().connection).toBeNull();
    const rows = await database.system
      .selectFrom('whatsapp_connections')
      .select('account_id')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toHaveLength(0);
  });
  it('answers 404 when none is connected, 401 signed out, 403 for staff', async () => {
    const person = await newBusinessWithWhatsapp();
    expect((await send(person, 'DELETE', '')).statusCode).toBe(404);
    expect((await send(null, 'DELETE', '')).statusCode).toBe(401);
    const staff = await createSignedInPerson(app, database);
    await switchOnWhatsapp(database, staff.profile.business.id);
    await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', staff.profile.user.id).execute();
    expect((await send(staff, 'DELETE', '')).statusCode).toBe(403);
    expect(randomUUID()).toBeTruthy();
  });
});
