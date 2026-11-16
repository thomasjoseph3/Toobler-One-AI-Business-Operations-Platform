import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, testConfig, unsafeRequestHeaders } from './support/app';
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
  method: 'GET' | 'PATCH',
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

const getSettings = (person: SignedInPerson | null) => send(person, 'GET', '/channels/webchat');
const changeSettings = (person: SignedInPerson | null, body: unknown, withCsrfHeaders = true) =>
  send(person, 'PATCH', '/channels/webchat', body, withCsrfHeaders);

async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

describe('GET /api/v1/channels/webchat', () => {
  it('makes the business’s settings the first time: a new key, no allowed website, the ready-chosen look, only the chat button', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await getSettings(person);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.widgetKey).toMatch(/^wk_[A-Za-z0-9_-]{32}$/);
    expect(body).toMatchObject({
      colour: '#161715',
      greeting: 'Hi! How can I help you today?',
      position: 'bottom_right',
      allowedWebsites: [],
      phoneNumber: null,
      whatsappNumber: null,
      whatsappMessage: null,
      buttonOrder: ['chat', 'call', 'whatsapp'],
      buttonsShown: ['chat'],
      lastSeen: null,
    });
    expect(body.snippet).toBe(
      `<script src="${testConfig().publicBaseUrl}/widget/loader.js" data-key="${body.widgetKey}" async></script>`,
    );
  });

  it('gives the same key every time, and a different key to every business', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    const firstKey = (await getSettings(first)).json().widgetKey;
    expect((await getSettings(first)).json().widgetKey).toBe(firstKey);
    expect((await getSettings(second)).json().widgetKey).not.toBe(firstKey);
  });

  it('makes only one row when two first reads arrive at the same moment', async () => {
    const person = await createSignedInPerson(app, database);
    const answers = await Promise.all([getSettings(person), getSettings(person), getSettings(person)]);
    expect(answers.every((answer) => answer.statusCode === 200)).toBe(true);
    expect(new Set(answers.map((answer) => answer.json().widgetKey)).size).toBe(1);
    const rows = await database.system
      .selectFrom('webchat_settings')
      .select('widget_key')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('is open to every signed-in role, and answers 401 to nobody', async () => {
    const person = await createSignedInPerson(app, database);
    for (const role of ['manager', 'staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await getSettings(person)).statusCode, role).toBe(200);
    }
    expect((await getSettings(null)).statusCode).toBe(401);
  });
});

describe('PATCH /api/v1/channels/webchat', () => {
  it('changes the look and the websites, tidying each website to its address', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await changeSettings(person, {
      colour: '#1f6feb',
      greeting: 'Welcome to Nair Stays!',
      position: 'bottom_left',
      allowedWebsites: ['https://NairStays.Example/', 'https://nairstays.example', 'http://localhost:5173'],
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      colour: '#1F6FEB',
      greeting: 'Welcome to Nair Stays!',
      position: 'bottom_left',
      allowedWebsites: ['https://nairstays.example', 'http://localhost:5173'],
    });
    // It stays changed
    expect((await getSettings(person)).json().allowedWebsites).toEqual([
      'https://nairstays.example',
      'http://localhost:5173',
    ]);
  });

  it('shows the Call and WhatsApp buttons once their numbers are set, with the numbers in international form', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await changeSettings(person, {
      phoneNumber: '98470 12345',
      whatsappNumber: '+91 98470-54321',
      whatsappMessage: 'Hi, I would like to book a room',
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      phoneNumber: '+919847012345',
      whatsappNumber: '+919847054321',
      whatsappMessage: 'Hi, I would like to book a room',
      buttonsShown: ['chat', 'call', 'whatsapp'],
    });
  });

  it('puts the buttons in the business’s order, and hides a number’s button when the number is cleared', async () => {
    const person = await createSignedInPerson(app, database);
    await changeSettings(person, { phoneNumber: '+919847012345', whatsappNumber: '+919847054321' });
    const reordered = await changeSettings(person, { buttonOrder: ['whatsapp', 'chat'] });
    expect(reordered.json()).toMatchObject({ buttonOrder: ['whatsapp', 'chat'], buttonsShown: ['whatsapp', 'chat'] });
    const cleared = await changeSettings(person, {
      whatsappNumber: null,
      whatsappMessage: null,
      buttonOrder: ['chat', 'call', 'whatsapp'],
    });
    expect(cleared.json()).toMatchObject({
      whatsappNumber: null,
      whatsappMessage: null,
      buttonsShown: ['chat', 'call'],
    });
  });

  it('changes only what is sent', async () => {
    const person = await createSignedInPerson(app, database);
    await changeSettings(person, { greeting: 'Hello there', colour: '#112233' });
    const response = await changeSettings(person, { position: 'bottom_left' });
    expect(response.json()).toMatchObject({ greeting: 'Hello there', colour: '#112233', position: 'bottom_left' });
  });

  it('writes one activity-log line with only the names of what changed, never a number or a website', async () => {
    const person = await createSignedInPerson(app, database);
    await changeSettings(person, {
      phoneNumber: '+919847012345',
      allowedWebsites: ['https://secret-site.example'],
      colour: '#abcdef',
    });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'webchat.settings_changed')
      .execute();
    expect(lines).toHaveLength(1);
    expect([...(lines[0]?.fields ?? [])].sort()).toEqual(['allowedWebsites', 'colour', 'phoneNumber']);
    expect(JSON.stringify(lines)).not.toContain('9847012345');
    expect(JSON.stringify(lines)).not.toContain('secret-site');
  });

  it('writes nothing when what is sent is already what is set', async () => {
    const person = await createSignedInPerson(app, database);
    await changeSettings(person, { greeting: 'Same greeting', allowedWebsites: ['https://nairstays.example'] });
    await changeSettings(person, { greeting: 'Same greeting', allowedWebsites: ['https://nairstays.example/'] });
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'webchat.settings_changed')
      .execute();
    expect(lines).toHaveLength(1);
  });

  it('answers 401 to nobody and 403 to staff, who may only read', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await changeSettings(null, { greeting: 'x' })).statusCode).toBe(401);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await changeSettings(person, { greeting: 'Hi' })).statusCode, role).toBe(403);
    }
    expect((await getSettings(person)).json().greeting).toBe('Hi! How can I help you today?');
  });

  it('is refused without the web app’s headers (CSRF)', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await changeSettings(person, { greeting: 'Hi' }, false)).statusCode).toBe(403);
  });

  it('answers 400 for input it cannot use, each with a clear code', async () => {
    const person = await createSignedInPerson(app, database);
    const bad: Array<[string, unknown, string?]> = [
      ['nothing sent', {}, 'NOTHING_TO_CHANGE'],
      ['an unknown field', { greeting: 'Hi', widgetKey: 'wk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
      ['an account id', { accountId: '00000000-0000-4000-8000-000000000000' }],
      ['a bad colour', { colour: 'red' }],
      ['a short colour', { colour: '#fff' }],
      ['an empty greeting', { greeting: '   ' }],
      ['a long greeting', { greeting: 'x'.repeat(201) }],
      ['a bad position', { position: 'middle' }],
      ['a wildcard website', { allowedWebsites: ['https://*.nairstays.example'] }, 'INVALID_WEBSITE'],
      ['a website with a page', { allowedWebsites: ['https://nairstays.example/contact'] }, 'INVALID_WEBSITE'],
      ['a website that is not one', { allowedWebsites: ['nairstays'] }, 'INVALID_WEBSITE'],
      ['a script address', { allowedWebsites: ['javascript:alert(1)'] }, 'INVALID_WEBSITE'],
      [
        'too many websites',
        { allowedWebsites: Array.from({ length: 21 }, (_, number) => `https://site${number}.example`) },
      ],
      ['a phone number that is not one', { phoneNumber: 'call me' }, 'INVALID_PHONE_NUMBER'],
      ['a WhatsApp number that is not one', { whatsappNumber: '12' }, 'INVALID_PHONE_NUMBER'],
      ['a long WhatsApp message', { whatsappMessage: 'x'.repeat(301) }],
      ['a button twice', { buttonOrder: ['chat', 'chat'] }, 'INVALID_BUTTONS'],
      ['no chat button', { buttonOrder: ['call', 'whatsapp'] }, 'INVALID_BUTTONS'],
      ['an unknown button', { buttonOrder: ['chat', 'sms'] }],
      ['no buttons', { buttonOrder: [] }],
    ];
    for (const [what, body, code] of bad) {
      const response = await changeSettings(person, body);
      expect(response.statusCode, `${what}: ${response.body}`).toBe(400);
      if (code) expect(response.json().error.code, what).toBe(code);
    }
    // Nothing above changed anything
    expect((await getSettings(person)).json()).toMatchObject({
      greeting: 'Hi! How can I help you today?',
      allowedWebsites: [],
    });
  });

  it('never changes the widget key, the other business’s settings, or lets a business act on another’s row', async () => {
    const mine = await createSignedInPerson(app, database);
    const theirs = await createSignedInPerson(app, database);
    const theirKey = (await getSettings(theirs)).json().widgetKey;
    await changeSettings(mine, { greeting: 'Mine', allowedWebsites: ['https://mine.example'] });
    const theirs2 = (await getSettings(theirs)).json();
    expect(theirs2.widgetKey).toBe(theirKey);
    expect(theirs2.greeting).toBe('Hi! How can I help you today?');
    expect(theirs2.allowedWebsites).toEqual([]);
    // The database itself refuses to change a key (the app role has no right to)
    await expect(
      database.runInAccountTransaction(mine.profile.business.id, (transaction) =>
        transaction
          .updateTable('webchat_settings')
          .set({ widget_key: 'wk_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' })
          .where('account_id', '=', mine.profile.business.id)
          .execute(),
      ),
    ).rejects.toThrow();
  });

  it('cannot see another business’s row through the database fence', async () => {
    const mine = await createSignedInPerson(app, database);
    const theirs = await createSignedInPerson(app, database);
    await getSettings(mine);
    const theirKey = (await getSettings(theirs)).json().widgetKey;
    const seenByMe = await database.runInAccountTransaction(mine.profile.business.id, (transaction) =>
      transaction.selectFrom('webchat_settings').select('widget_key').execute(),
    );
    expect(seenByMe.map((row) => row.widget_key)).not.toContain(theirKey);
    expect(seenByMe).toHaveLength(1);
  });
});

describe('the website chat module can be switched off (plug and play)', () => {
  it('answers 404 to both routes while it is off, keeps its data, and works again with the same key when it is back on', async () => {
    const person = await createSignedInPerson(app, database);
    await changeSettings(person, { greeting: 'Before switching off', allowedWebsites: ['https://nairstays.example'] });
    const key = (await getSettings(person)).json().widgetKey;

    const off = await send(person, 'PATCH', '/modules/channel.webchat', { enabled: false });
    expect(off.statusCode, off.body).toBe(200);
    expect((await getSettings(person)).statusCode).toBe(404);
    expect((await changeSettings(person, { greeting: 'x' })).statusCode).toBe(404);

    const on = await send(person, 'PATCH', '/modules/channel.webchat', { enabled: true });
    expect(on.statusCode, on.body).toBe(200);
    const back = (await getSettings(person)).json();
    expect(back).toMatchObject({
      widgetKey: key,
      greeting: 'Before switching off',
      allowedWebsites: ['https://nairstays.example'],
    });
  });
});
