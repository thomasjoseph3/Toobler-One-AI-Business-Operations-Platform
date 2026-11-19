import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createScriptedMailboxProvider, switchOnEmail } from './support/mailbox';

let database: Database;
let app: FastifyInstance;
const mailbox = createScriptedMailboxProvider();

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database, [], { mailboxProvider: mailbox.provider });
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
    url: `/api/v1/channels/email${url}`,
    headers: { ...unsafeRequestHeaders, ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

async function newBusinessWithEmail() {
  const person = await createSignedInPerson(app, database);
  await switchOnEmail(database, person.profile.business.id);
  return person;
}
async function newStaffWithEmail() {
  const staff = await createSignedInPerson(app, database);
  await switchOnEmail(database, staff.profile.business.id);
  await database.system.updateTable('users').set({ role: 'staff' }).where('id', '=', staff.profile.user.id).execute();
  return staff;
}
const goodBody = { address: 'Enquiries@NairStays.example', password: 'app-password-1234' };

describe('GET /api/v1/channels/email', () => {
  it('shows no connection yet', async () => {
    const person = await newBusinessWithEmail();
    const response = await send(person, 'GET', '');
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ connection: null });
  });
  it('answers 401 signed out, 403 for staff, 404 when Email is not in the plan', async () => {
    expect((await send(null, 'GET', '')).statusCode).toBe(401);
    expect((await send(await newStaffWithEmail(), 'GET', '')).statusCode).toBe(403);
    expect((await send(await createSignedInPerson(app, database), 'GET', '')).statusCode).toBe(404);
  });
});

describe('PUT /api/v1/channels/email', () => {
  it('connects a mailbox: server names guessed from the address, the address tidied, the password never shown again, drafts by default', async () => {
    const person = await newBusinessWithEmail();
    const response = await send(person, 'PUT', '', goodBody);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      address: 'enquiries@nairstays.example',
      username: 'enquiries@nairstays.example',
      imapHost: 'imap.nairstays.example',
      smtpHost: 'smtp.nairstays.example',
      imapPort: 993,
      smtpPort: 587,
      passwordPreview: '••••1234',
      replyMode: 'draft',
      readEmails: true,
      status: 'unchecked',
    });
    expect(response.body).not.toContain('app-password');
    const stored = await database.system
      .selectFrom('email_connections')
      .select('encrypted_password')
      .where('account_id', '=', person.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(stored.encrypted_password).toMatch(/^v1\./);
    expect(stored.encrypted_password).not.toContain('app-password');
  });
  it('knows Gmail’s servers', async () => {
    const person = await newBusinessWithEmail();
    const response = await send(person, 'PUT', '', { address: 'shop@gmail.com', password: 'abcd efgh ijkl mnop' });
    expect(response.json()).toMatchObject({ imapHost: 'imap.gmail.com', smtpHost: 'smtp.gmail.com' });
  });
  it('keeps the password when only a setting changes, and changes the reply mode', async () => {
    const person = await newBusinessWithEmail();
    await send(person, 'PUT', '', goodBody);
    const response = await send(person, 'PUT', '', {
      address: 'enquiries@nairstays.example',
      replyMode: 'send',
      readEmails: false,
    });
    expect(response.json()).toMatchObject({ passwordPreview: '••••1234', replyMode: 'send', readEmails: false });
  });
  it('answers 400 PASSWORD_NEEDED the first time without a password, and 400 for a bad address, server or mode', async () => {
    const person = await newBusinessWithEmail();
    const noPassword = await send(person, 'PUT', '', { address: 'a@b.example' });
    expect(noPassword.statusCode).toBe(400);
    expect(noPassword.json().error.code).toBe('PASSWORD_NEEDED');
    expect((await send(person, 'PUT', '', { address: 'not-an-address', password: 'abcd1234' })).statusCode).toBe(400);
    expect((await send(person, 'PUT', '', { ...goodBody, imapHost: 'not a host!' })).statusCode).toBe(400);
    expect((await send(person, 'PUT', '', { ...goodBody, replyMode: 'sometimes' })).statusCode).toBe(400);
  });
  it('answers 401, 403 and 404 like the other routes', async () => {
    expect((await send(null, 'PUT', '', goodBody)).statusCode).toBe(401);
    expect((await send(await newStaffWithEmail(), 'PUT', '', goodBody)).statusCode).toBe(403);
    expect((await send(await createSignedInPerson(app, database), 'PUT', '', goodBody)).statusCode).toBe(404);
  });
});

describe('POST /api/v1/channels/email/check', () => {
  it('signs in to the mailbox and keeps the answer, working or failed with the server’s reason', async () => {
    const person = await newBusinessWithEmail();
    await send(person, 'PUT', '', goodBody);
    const working = await send(person, 'POST', '/check');
    expect(working.json()).toMatchObject({ ok: true, connection: { status: 'working' } });
    mailbox.state.checkResult = async () => {
      throw new Error('Invalid credentials');
    };
    const failed = await send(person, 'POST', '/check');
    expect(failed.json()).toMatchObject({ ok: false, note: 'Invalid credentials', connection: { status: 'failed' } });
    mailbox.state.checkResult = async () => 'Read access works (3 emails in the inbox)';
  });
  it('answers 404 with no connection, 401 signed out, 403 for staff', async () => {
    expect((await send(await newBusinessWithEmail(), 'POST', '/check')).statusCode).toBe(404);
    expect((await send(null, 'POST', '/check')).statusCode).toBe(401);
    expect((await send(await newStaffWithEmail(), 'POST', '/check')).statusCode).toBe(403);
  });
});

describe('DELETE /api/v1/channels/email', () => {
  it('removes the connection and the saved password', async () => {
    const person = await newBusinessWithEmail();
    await send(person, 'PUT', '', goodBody);
    expect((await send(person, 'DELETE', '')).statusCode).toBe(204);
    expect((await send(person, 'GET', '')).json().connection).toBeNull();
    const rows = await database.system
      .selectFrom('email_connections')
      .select('account_id')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toHaveLength(0);
  });
  it('answers 404 when none is connected, 401 signed out, 403 for staff', async () => {
    expect((await send(await newBusinessWithEmail(), 'DELETE', '')).statusCode).toBe(404);
    expect((await send(null, 'DELETE', '')).statusCode).toBe(401);
    expect((await send(await newStaffWithEmail(), 'DELETE', '')).statusCode).toBe(403);
  });
});
