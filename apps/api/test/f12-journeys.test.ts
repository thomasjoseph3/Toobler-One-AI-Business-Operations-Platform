import { parse } from 'csv-parse/sync';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { buildExport } from '../src/modules/core/exports/services/export-build.service';
import { runImport } from '../src/modules/core/imports/services/import-run.service';
import { buildTestApp, testConfig } from './support/app';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender } from './support/mail';
import { addTeamMember, signUpOwner } from './support/team';

// Journey test for import and export (F12): a whole story told as one route after another, by real people with their own sessions.

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  const mail = createRecordingMailSender();
  const contextFor = (accountId: unknown) =>
    createContextFactory(database)(String(accountId), { kind: 'system', id: 'test' });
  app = await buildTestApp(database, [], {
    mailSender: mail,
    enqueueJob: async (jobName, data) => {
      if (jobName === 'imports.run') await runImport(contextFor(data.accountId), String(data.importId));
      else if (jobName === 'exports.build')
        await buildExport(contextFor(data.accountId), String(data.exportId), { mail, config: testConfig() });
      else throw new Error(`Unexpected job ${jobName}`);
    },
  });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

describe('journey: bring customers in from a spreadsheet, work with them, and take them out again', () => {
  it('a manager uploads a messy file → fixes the columns → reads the counts → runs it → reads the report → re-imports with no duplicates → exports exactly what a filtered list shows; staff can do none of it', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    await owner.ok(
      'POST',
      '/fields',
      { object: 'contact', label: 'Car model', type: 'dropdown', options: ['Swift', 'Baleno'] },
      201,
    );

    // Staff cannot start any of it
    expect(
      (await staff.upload('/imports', { fileName: 'a.csv', content: Buffer.from('Phone\n98470 12345\n') })).statusCode,
    ).toBe(403);
    await staff.refused('POST', '/exports', { object: 'contact' }, 403);

    // The manager's file: odd column names, a company, a bad phone, a row with nobody to reach, a car model that is not on the list
    const file = [
      'Customer;Mobile No;Mail;Organisation;Car Model;Notes',
      'Priya Menon;98470 12345;priya@menon.example;Infosys HR;Swift;likes tea',
      'Rahul Nair;+91 94470 00111;;Menon Weddings;Baleno;',
      'Meera Shah;12;meera@shah.example;;Swift;',
      'Nobody;;;;;',
      'Anita Das;98460 55605;anita@das.example;;Tesla;',
    ].join('\n');
    const uploaded = await owner.upload('/imports', { fileName: 'customers.csv', content: Buffer.from(file) });
    expect(uploaded.statusCode, uploaded.body).toBe(201);
    const created = uploaded.json();
    // The columns were guessed from their names, including the business's own field; "Notes" is left alone
    expect(created.targets).toEqual(['name', 'phone', 'email', 'company', 'custom.car_model', null]);

    const mapped = await owner.ok('PATCH', `/imports/${created.id}`, { targets: created.targets });
    expect(mapped.counts).toEqual({ newContacts: 2, matchedContacts: 0, skipped: 3 });
    await owner.ok('POST', `/imports/${created.id}/run`, undefined, 202);
    const done = await owner.ok('GET', `/imports/${created.id}`);
    expect(done).toMatchObject({
      status: 'done',
      processed: 5,
      counts: { newContacts: 2, matchedContacts: 0, skipped: 3 },
    });
    expect(done.report.map((entry: { row: number; reason: string }) => [entry.row, entry.reason])).toEqual([
      [4, 'invalid_phone'],
      [5, 'no_contact_point'],
      [6, 'invalid_custom'],
    ]);

    // The contacts are there, marked imported, with their company and custom answer
    const contacts = (await owner.ok('GET', '/contacts?limit=100')).items;
    expect(contacts.map((contact: { name: string }) => contact.name).sort()).toEqual(['Priya Menon', 'Rahul Nair']);
    expect(contacts.every((contact: { importedAt: string | null }) => contact.importedAt !== null)).toBe(true);

    // Importing the same file again changes nothing
    const again = await owner.upload('/imports', { fileName: 'customers.csv', content: Buffer.from(file) });
    const againId = again.json().id;
    await owner.ok('PATCH', `/imports/${againId}`, { targets: again.json().targets });
    await owner.ok('POST', `/imports/${againId}/run`, undefined, 202);
    expect(await owner.ok('GET', `/imports/${againId}`)).toMatchObject({
      counts: { newContacts: 0, matchedContacts: 2, skipped: 3 },
    });
    expect((await owner.ok('GET', '/contacts?limit=100')).total).toBe(2);
    expect((await owner.ok('GET', '/companies')).items).toHaveLength(2);

    // The export of a filtered list holds exactly what the list shows, including the custom field and the company
    const filters = JSON.stringify([{ field: 'custom.car_model', operator: 'is', value: 'swift' }]);
    const query = `filters=${encodeURIComponent(filters)}`;
    const listed = (await owner.ok('GET', `/contacts?${query}&limit=100`)).items.map(
      (contact: { name: string }) => contact.name,
    );
    const requested = await owner.ok('POST', '/exports', { object: 'contact', query }, 202);
    const status = await owner.ok('GET', `/exports/${requested.id}`);
    expect(status.status).toBe('done');
    const download = await owner.send('GET', `/exports/${requested.id}/download`);
    const rows = parse(download.body, { bom: true }) as string[][];
    expect(rows.slice(1).map((row) => row[0])).toEqual(listed);
    expect(rows[1]).toEqual([
      'Priya Menon',
      '+919847012345',
      'priya@menon.example',
      '',
      'New',
      'Infosys HR',
      'Imported',
      expect.any(String),
      'Swift',
    ]);

    // Staff cannot read or download it either, and everything the manager did is in the activity log without any contents
    await staff.refused('GET', `/exports/${requested.id}/download`, undefined, 403);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('kind')
      .where('account_id', '=', owner.businessId)
      .where('kind', 'like', 'imports.%')
      .execute();
    expect(lines.length).toBeGreaterThanOrEqual(6);
  });
});
