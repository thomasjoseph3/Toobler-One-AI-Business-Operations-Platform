import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { runImport } from '../src/modules/core/imports/services/import-run.service';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// F12: POST /imports, PATCH /imports/{id}, POST /imports/{id}/run and GET /imports/{id} (spreadsheet imports of contacts, managers only).

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  // The job runs at once, in the test, as the real job runner would a moment later
  app = await buildTestApp(database, [], {
    enqueueJob: async (jobName, data) => {
      if (jobName !== 'imports.run') throw new Error(`Unexpected job ${jobName}`);
      await runImport(
        createContextFactory(database)(String(data.accountId), { kind: 'system', id: 'test' }),
        String(data.importId),
      );
    },
  });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const csv = (text: string) => ({
  fileName: 'customers.csv',
  content: Buffer.from(text, 'utf8'),
  contentType: 'text/csv',
});

/** A business whose owner defaults to India, with a contact field and an existing contact the file will match. */
async function business() {
  const owner = await signUpOwner(app, database);
  await owner.ok(
    'POST',
    '/fields',
    { object: 'contact', label: 'Car model', type: 'dropdown', options: ['Swift', 'Baleno'] },
    201,
  );
  await owner.ok('POST', '/fields', { object: 'contact', label: 'Birthday', type: 'date' }, 201);
  return owner;
}

/** Uploads, accepts the guessed columns, and runs. Returns the finished import. */
async function importFile(owner: TeamMember, file: ReturnType<typeof csv>) {
  const uploaded = await owner.upload('/imports', file);
  expect(uploaded.statusCode, uploaded.body).toBe(201);
  const created = uploaded.json();
  await owner.ok('PATCH', `/imports/${created.id}`, { targets: created.targets });
  await owner.ok('POST', `/imports/${created.id}/run`, undefined, 202);
  return owner.ok('GET', `/imports/${created.id}`);
}

const SAMPLE = [
  'Name,Mobile,Email,Company,Car model,Birthday',
  'Priya Menon,98470 12345,priya@menon.example,Infosys HR,Swift,1990-05-04',
  'Rahul Nair,94470 00111,,Menon Weddings,Baleno,',
  'No Contact,,,,,',
  'Meera Shah,12,meera@shah.example,,Swift,',
  'Anita Das,98460 55605,anita@das.example,,Tesla,',
].join('\n');

describe('POST /imports', () => {
  it('reads the file, keeps the rows, guesses the columns and shows the first rows', async () => {
    const owner = await business();
    const response = await owner.upload('/imports', csv(SAMPLE));
    expect(response.statusCode, response.body).toBe(201);
    const created = response.json();
    expect(created).toMatchObject({
      fileName: 'customers.csv',
      status: 'uploaded',
      rowCount: 5,
      headers: ['Name', 'Mobile', 'Email', 'Company', 'Car model', 'Birthday'],
      targets: ['name', 'phone', 'email', 'company', 'custom.car_model', 'custom.birthday'],
      counts: null,
      processed: 0,
    });
    expect(created.sample).toHaveLength(5);
    expect(created.sample[0]).toEqual([
      'Priya Menon',
      '98470 12345',
      'priya@menon.example',
      'Infosys HR',
      'Swift',
      '1990-05-04',
    ]);
  });

  it('reads an Excel file the same way', async () => {
    const owner = await business();
    const response = await owner.upload('/imports', {
      fileName: 'customers.xlsx',
      content: readFileSync(new URL('./fixtures/customers.xlsx', import.meta.url)),
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      rowCount: 4,
      targets: ['name', 'phone', 'email', 'company', 'custom.car_model', 'custom.birthday'],
    });
  });

  it('refuses a file that is no use, with a plain code (400), and one that is too big (413)', async () => {
    const owner = await business();
    const refuse = async (file: Parameters<typeof owner.upload>[1], status: number, code: string) => {
      const response = await owner.upload('/imports', file);
      expect(response.statusCode, `${file.fileName}: ${response.body}`).toBe(status);
      expect(response.json().error.code).toBe(code);
    };
    await refuse(csv(''), 400, 'EMPTY_FILE');
    await refuse(csv('Name,Phone\n'), 400, 'EMPTY_FILE');
    await refuse(
      { fileName: 'photo.png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]) },
      400,
      'INVALID_FILE',
    );
    await refuse({ fileName: 'big.csv', content: Buffer.alloc(10 * 1024 * 1024 + 10, 'a') }, 413, 'FILE_TOO_LARGE');
    const noFile = await owner.send('POST', '/imports', {});
    expect(noFile.statusCode).toBe(400);
  });

  it('is for managers only (403), and writes one activity line with no file contents', async () => {
    const owner = await business();
    const staff = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    expect((await staff.upload('/imports', csv(SAMPLE))).statusCode).toBe(403);
    await owner.upload('/imports', csv(SAMPLE));
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'imports.uploaded')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain('priya@menon');
  });
});

describe('PATCH /imports/{id}', () => {
  it('counts new contacts, matches with people already there, and skipped rows with the reasons', async () => {
    const owner = await business();
    await owner.ok('POST', '/contacts', { name: 'Priya M', phone: '+919847012345' }, 201);
    const created = (await owner.upload('/imports', csv(SAMPLE))).json();
    const mapped = await owner.ok('PATCH', `/imports/${created.id}`, { targets: created.targets });
    expect(mapped.status).toBe('ready');
    // Priya matches the phone; Rahul is new; "No Contact" has no way to reach them; Meera's phone is not a number; Anita's car model is not on the list
    expect(mapped.counts).toEqual({ newContacts: 1, matchedContacts: 1, skipped: 3 });
    expect(mapped.report).toEqual([
      { row: 4, reason: 'no_contact_point', message: expect.any(String) },
      { row: 5, reason: 'invalid_phone', message: expect.any(String) },
      { row: 6, reason: 'invalid_custom', message: expect.stringContaining('Car model') },
    ]);
    expect(JSON.stringify(mapped.report)).not.toContain('Tesla');
  });

  it('counts the same person twice in one file as one new contact and one match', async () => {
    const owner = await business();
    const created = (await owner.upload('/imports', csv('Phone\n98470 12345\n+91 98470 12345\n98470 99999\n'))).json();
    const mapped = await owner.ok('PATCH', `/imports/${created.id}`, { targets: ['phone'] });
    expect(mapped.counts).toEqual({ newContacts: 2, matchedContacts: 1, skipped: 0 });
  });

  it('lets the manager change the columns and count again', async () => {
    const owner = await business();
    const created = (await owner.upload('/imports', csv('Contact,Other\n98470 12345,priya@x.example\n'))).json();
    expect(created.targets).toEqual([null, null]);
    expect(await owner.refused('PATCH', `/imports/${created.id}`, { targets: [null, 'name'] }, 400)).toBe(
      'INVALID_MAPPING',
    );
    const mapped = await owner.ok('PATCH', `/imports/${created.id}`, { targets: ['phone', 'email'] });
    expect(mapped.counts).toEqual({ newContacts: 1, matchedContacts: 0, skipped: 0 });
    expect((await owner.ok('PATCH', `/imports/${created.id}`, { targets: [null, 'email'] })).counts.newContacts).toBe(
      1,
    );
  });

  it('refuses a mapping that makes no sense (400 INVALID_MAPPING) and a body of the wrong shape (400)', async () => {
    const owner = await business();
    const created = (await owner.upload('/imports', csv('A,B\n98470 12345,x\n'))).json();
    for (const targets of [
      ['phone'],
      ['phone', 'phone'],
      ['phone', 'colour'],
      ['name', 'language'],
      ['custom.gone', 'phone'],
    ]) {
      expect(await owner.refused('PATCH', `/imports/${created.id}`, { targets }, 400), JSON.stringify(targets)).toBe(
        'INVALID_MAPPING',
      );
    }
    await owner.refused('PATCH', `/imports/${created.id}`, {}, 400);
    await owner.refused('PATCH', `/imports/${created.id}`, { targets: ['phone', null], extra: 1 }, 400);
    await owner.refused('PATCH', '/imports/not-an-id', { targets: ['phone'] }, 400);
  });
});

describe('POST /imports/{id}/run and GET /imports/{id}', () => {
  it('saves the contacts, fills in their companies and custom answers, marks them imported, and reports the skipped rows', async () => {
    const owner = await business();
    const done = await importFile(owner, csv(SAMPLE));
    expect(done).toMatchObject({
      status: 'done',
      processed: 5,
      counts: { newContacts: 2, matchedContacts: 0, skipped: 3 },
      sample: [],
    });
    expect(done.finishedAt).not.toBeNull();
    const contacts = (await owner.ok('GET', '/contacts?limit=100')).items;
    expect(contacts).toHaveLength(2);
    const priya = contacts.find((contact: { name: string }) => contact.name === 'Priya Menon');
    expect(priya).toMatchObject({
      phone: '+919847012345',
      email: 'priya@menon.example',
      custom: { car_model: 'Swift', birthday: '1990-05-04' },
    });
    expect(priya.importedAt).not.toBeNull();
    expect(priya.companyId).not.toBeNull();
    const companies = (await owner.ok('GET', '/companies')).items
      .map((company: { name: string }) => company.name)
      .sort();
    expect(companies).toEqual(['Infosys HR', 'Menon Weddings']);
  });

  it('deletes the rows when the run ends, keeping only the counts and the report', async () => {
    const owner = await business();
    const done = await importFile(owner, csv(SAMPLE));
    const stored = await database.system
      .selectFrom('imports')
      .select(['data', 'status'])
      .where('id', '=', done.id)
      .executeTakeFirstOrThrow();
    expect(stored.data).toBeNull();
    expect(stored.status).toBe('done');
    expect(done.report).toHaveLength(3);
  });

  it('updates a person who is already there and never makes a duplicate: re-importing the same file changes nothing the second time', async () => {
    const owner = await business();
    await owner.ok('POST', '/contacts', { name: 'Priya Existing', phone: '+919847012345', language: 'ml' }, 201);
    const first = await importFile(owner, csv(SAMPLE));
    expect(first.counts).toEqual({ newContacts: 1, matchedContacts: 1, skipped: 3 });
    const afterFirst = (await owner.ok('GET', '/contacts?limit=100')).items;
    expect(afterFirst).toHaveLength(2);
    // The name staff gave is kept; what was missing (email) and the custom answers are filled in; she is not marked imported
    const priya = afterFirst.find((contact: { phone: string }) => contact.phone === '+919847012345');
    expect(priya).toMatchObject({
      name: 'Priya Existing',
      language: 'ml',
      email: 'priya@menon.example',
      custom: { car_model: 'Swift' },
      importedAt: null,
    });

    const second = await importFile(owner, csv(SAMPLE));
    expect(second.counts).toEqual({ newContacts: 0, matchedContacts: 2, skipped: 3 });
    expect((await owner.ok('GET', '/contacts?limit=100')).items).toHaveLength(2);
    expect((await owner.ok('GET', '/companies')).items).toHaveLength(2);
  });

  it('matches by email when the phone is not in the file, and never takes a phone that belongs to another contact', async () => {
    const owner = await business();
    const byEmail = await owner.ok('POST', '/contacts', { name: 'Has email', email: 'a@x.example' }, 201);
    const hasPhone = await owner.ok('POST', '/contacts', { name: 'Has phone', phone: '+919847000009' }, 201);
    await importFile(owner, csv('Name,Email,Phone\nIgnored Name,a@x.example,98470 00009\n'));
    // The phone matches one contact and the email another: the phone wins, and a detail that belongs to a different contact is never moved onto it
    expect(await owner.ok('GET', `/contacts/${hasPhone.id}`)).toMatchObject({ email: null, name: 'Has phone' });
    expect(await owner.ok('GET', `/contacts/${byEmail.id}`)).toMatchObject({ phone: null, email: 'a@x.example' });
    expect((await owner.ok('GET', '/contacts?limit=100')).total).toBe(2);
  });

  it('can only be run once, and only after the columns were checked (409)', async () => {
    const owner = await business();
    const created = (await owner.upload('/imports', csv(SAMPLE))).json();
    expect(await owner.refused('POST', `/imports/${created.id}/run`, undefined, 409)).toBe('IMPORT_NOT_READY');
    await owner.ok('PATCH', `/imports/${created.id}`, { targets: created.targets });
    await owner.ok('POST', `/imports/${created.id}/run`, undefined, 202);
    expect(await owner.refused('POST', `/imports/${created.id}/run`, undefined, 409)).toBe('IMPORT_NOT_READY');
    expect(await owner.refused('PATCH', `/imports/${created.id}`, { targets: created.targets }, 409)).toBe(
      'IMPORT_ALREADY_STARTED',
    );
  });

  it('writes an activity line when it starts and when it finishes, with counts only', async () => {
    const owner = await business();
    await importFile(owner, csv(SAMPLE));
    const kinds = (
      await database.system
        .selectFrom('activity_log')
        .select('kind')
        .where('account_id', '=', owner.businessId)
        .where('kind', 'like', 'imports.%')
        .execute()
    )
      .map((line) => line.kind)
      .sort();
    expect(kinds).toEqual(['imports.finished', 'imports.started', 'imports.uploaded']);
  });

  it('carries on from the rows already done when the job is run again, without duplicating anyone', async () => {
    const owner = await business();
    const rows = Array.from({ length: 600 }, (_, index) => `+9715${String(10_000_000 + index)}`);
    const created = (await owner.upload('/imports', csv(['Phone', ...rows].join('\n')))).json();
    await owner.ok('PATCH', `/imports/${created.id}`, { targets: ['phone'] });
    // The job ran once and stopped after the first chunk (progress saved), then runs again
    await database.system
      .updateTable('imports')
      .set({ status: 'running', processed: 0 })
      .where('id', '=', created.id)
      .execute();
    const context = createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' });
    await runImport(context, created.id);
    await database.system
      .updateTable('imports')
      .set({ status: 'failed', processed: 250, data: JSON.stringify(rows.map((phone) => [phone])) })
      .where('id', '=', created.id)
      .execute();
    await runImport(context, created.id);
    const contacts = (await owner.ok('GET', '/contacts?limit=100&page=1')).total;
    expect(contacts).toBe(600);
  });

  it('answers 404 for an unknown import and for another business’s import, and 403 for staff', async () => {
    const owner = await business();
    const staff = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    const created = (await owner.upload('/imports', csv(SAMPLE))).json();
    const stranger = await signUpOwner(app, database);
    for (const [method, url, body] of [
      ['GET', `/imports/${created.id}`, undefined],
      ['PATCH', `/imports/${created.id}`, { targets: created.targets }],
      ['POST', `/imports/${created.id}/run`, undefined],
    ] as const) {
      await stranger.refused(method, url, body, 404);
      await owner.refused(method, url.replace(created.id, '0194c9a8-0000-7000-8000-000000000000'), body, 404);
      await staff.refused(method, url, body, 403);
    }
  });
});

describe('an import of 10,000 rows', () => {
  it(
    'finishes well inside two minutes with a clear report, and importing the same file again adds nobody',
    { timeout: 240_000 },
    async () => {
      const owner = await business();
      const lines = ['Name,Phone,Email,Car model'];
      for (let index = 0; index < 10_000; index += 1) {
        lines.push(
          `Person ${index},+9715${String(20_000_000 + index)},p${index}@bulk.example,${index % 2 === 0 ? 'Swift' : 'Baleno'}`,
        );
      }
      lines.push('No Phone Or Email,,,');
      const startedAt = Date.now();
      const first = await importFile(owner, csv(lines.join('\n')));
      const seconds = (Date.now() - startedAt) / 1000;
      console.log(`10,000-row import (upload, check, run): ${seconds.toFixed(1)} s`);
      expect(first.counts).toEqual({ newContacts: 10_000, matchedContacts: 0, skipped: 1 });
      expect(seconds).toBeLessThan(120);
      expect((await owner.ok('GET', '/contacts?limit=1')).total).toBe(10_000);
      const again = await importFile(owner, csv(lines.join('\n')));
      expect(again.counts).toEqual({ newContacts: 0, matchedContacts: 10_000, skipped: 1 });
      expect((await owner.ok('GET', '/contacts?limit=1')).total).toBe(10_000);
      // The count of skipped rows is exact, and the rows are gone
      expect(again.report).toHaveLength(1);
    },
  );
});

void uniqueUaeNumber;
