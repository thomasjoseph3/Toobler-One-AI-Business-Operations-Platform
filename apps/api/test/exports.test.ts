import { parse } from 'csv-parse/sync';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { testConfig } from './support/app';
import { buildExport } from '../src/modules/core/exports/services/export-build.service';
import { buildTestApp } from './support/app';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// F12: POST /exports, GET /exports/{id} and GET /exports/{id}/download (CSV exports of contacts, companies and leads, managers only).

let database: Database;
let app: FastifyInstance;
let mail: RecordingMailSender;

beforeAll(async () => {
  database = openTestDatabase();
  mail = createRecordingMailSender();
  // The job runs at once, in the test, as the real job runner would a moment later
  app = await buildTestApp(database, [], {
    mailSender: mail,
    enqueueJob: async (jobName, data) => {
      if (jobName !== 'exports.build') throw new Error(`Unexpected job ${jobName}`);
      await buildExport(
        createContextFactory(database)(String(data.accountId), { kind: 'system', id: 'test' }),
        String(data.exportId),
        {
          mail,
          config: testConfig(),
        },
      );
    },
  });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const filtersQuery = (conditions: unknown) => `filters=${encodeURIComponent(JSON.stringify(conditions))}`;

/** Asks for an export, and downloads and reads its CSV. */
async function exportList(owner: TeamMember, object: 'contact' | 'company' | 'lead', query = '') {
  const requested = await owner.ok('POST', '/exports', { object, query }, 202);
  const status = await owner.ok('GET', `/exports/${requested.id}`);
  expect(status.status, JSON.stringify(status)).toBe('done');
  const response = await owner.send('GET', `/exports/${requested.id}/download`);
  expect(response.statusCode, response.body).toBe(200);
  const rows = parse(response.body, { bom: true }) as string[][];
  return { requested, status, response, headers: rows[0]!, rows: rows.slice(1) };
}

async function business() {
  const owner = await signUpOwner(app, database);
  await owner.ok(
    'POST',
    '/fields',
    { object: 'contact', label: 'Car model', type: 'dropdown', options: ['Swift', 'Baleno'] },
    201,
  );
  await owner.ok('POST', '/fields', { object: 'company', label: 'Staff', type: 'number' }, 201);
  await owner.ok('POST', '/fields', { object: 'lead', label: 'Guests', type: 'number' }, 201);
  await owner.ok('POST', '/fields', { object: 'lead', label: 'VIP', type: 'yes_no' }, 201);
  const company = await owner.ok(
    'POST',
    '/companies',
    { name: 'Menon Weddings', domain: 'menon.example', city: 'Kochi', custom: { staff: 80 } },
    201,
  );
  await owner.ok('POST', '/companies', { name: 'Tiny Shop', custom: { staff: 3 } }, 201);
  const priya = await owner.ok(
    'POST',
    '/contacts',
    { name: 'Priya Menon', phone: '+919847012345', email: 'priya@menon.example', custom: { car_model: 'Swift' } },
    201,
  );
  await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
  const rahul = await owner.ok(
    'POST',
    '/contacts',
    { name: 'Rahul Nair', phone: uniqueUaeNumber(), custom: { car_model: 'Baleno' } },
    201,
  );
  await owner.ok(
    'POST',
    '/leads',
    {
      contactId: priya.id,
      interest: 'Hall, with "garden"',
      budgetPaise: 4_500_000,
      custom: { guests: 120, vip: true },
    },
    201,
  );
  await owner.ok('POST', '/leads', { contactId: rahul.id, custom: { guests: 40, vip: false } }, 201);
  return { owner, priya, rahul, company };
}

describe('POST /exports and the file', () => {
  it('exports the contacts exactly as the list shows them, with the company name and the custom fields', async () => {
    const { owner } = await business();
    const result = await exportList(owner, 'contact');
    expect(result.headers).toEqual([
      'Name',
      'Phone',
      'Email',
      'Language',
      'Stage',
      'Company',
      'Source',
      'Added',
      'Car model',
    ]);
    expect(result.rows).toHaveLength(2);
    const priya = result.rows.find((row) => row[0] === 'Priya Menon')!;
    expect(priya.slice(0, 3)).toEqual(['Priya Menon', '+919847012345', 'priya@menon.example']);
    expect(priya[5]).toBe('Menon Weddings');
    expect(priya[8]).toBe('Swift');
    expect(result.response.headers['content-type']).toContain('text/csv');
    expect(result.response.headers['content-disposition']).toMatch(
      /^attachment; filename="contacts-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(result.response.headers['cache-control']).toBe('no-store');
    expect(result.status).toMatchObject({
      rowCount: 2,
      fileName: expect.stringMatching(/^contacts-/),
      downloadPath: `/api/v1/exports/${result.requested.id}/download`,
    });
  });

  it('holds exactly what a filtered list shows: the same filters, search and stage as GET /contacts', async () => {
    const { owner } = await business();
    for (const query of [
      filtersQuery([{ field: 'custom.car_model', operator: 'is', value: 'swift' }]),
      'q=rahul',
      `q=menon&${filtersQuery([{ field: 'custom.car_model', operator: 'is_not_empty' }])}`,
      'lifecycleStage=new',
    ]) {
      const list = (await owner.ok('GET', `/contacts?${query}&limit=100`)).items
        .map((contact: { name: string }) => contact.name)
        .sort();
      const exported = (await exportList(owner, 'contact', query)).rows.map((row) => row[0]!).sort();
      expect(exported, query).toEqual(list);
    }
  });

  it('exports companies and leads, with the custom fields, the budget in rupees and the filters of their lists', async () => {
    const { owner } = await business();
    const companies = await exportList(
      owner,
      'company',
      filtersQuery([{ field: 'custom.staff', operator: 'greater_than', value: 10 }]),
    );
    expect(companies.headers).toEqual(['Name', 'Website', 'Phone', 'City', 'Added', 'Staff']);
    expect(companies.rows).toEqual([['Menon Weddings', 'menon.example', '', 'Kochi', expect.any(String), '80']]);

    const leads = await exportList(owner, 'lead');
    expect(leads.headers.slice(0, 4)).toEqual(['Name', 'Phone', 'Email', 'Stage']);
    expect(leads.headers.slice(-2)).toEqual(['Guests', 'VIP']);
    expect(leads.rows).toHaveLength(2);
    const priya = leads.rows.find((row) => row[0] === 'Priya Menon')!;
    expect(priya[leads.headers.indexOf('What they want')]).toBe('Hall, with "garden"');
    expect(priya[leads.headers.indexOf('Budget (rupees)')]).toBe('45000');
    expect(priya.slice(-2)).toEqual(['120', 'Yes']);
    const big = await exportList(
      owner,
      'lead',
      filtersQuery([{ field: 'custom.guests', operator: 'greater_than', value: 100 }]),
    );
    expect(big.rows.map((row) => row[0])).toEqual(['Priya Menon']);
  });

  it('is exact for a list longer than one page of the file (more than 500 rows)', { timeout: 120_000 }, async () => {
    const owner = await signUpOwner(app, database);
    const lines = ['Phone', ...Array.from({ length: 1234 }, (_, index) => `+9715${String(30_000_000 + index)}`)];
    const uploaded = await owner.upload('/imports', { fileName: 'many.csv', content: Buffer.from(lines.join('\n')) });
    const created = uploaded.json();
    await owner.ok('PATCH', `/imports/${created.id}`, { targets: ['phone'] });
    await database.system.updateTable('imports').set({ status: 'running' }).where('id', '=', created.id).execute();
    const { runImport } = await import('../src/modules/core/imports/services/import-run.service');
    await runImport(createContextFactory(database)(owner.businessId, { kind: 'system', id: 'test' }), created.id);
    const result = await exportList(owner, 'contact');
    expect(result.rows).toHaveLength(1234);
    expect(new Set(result.rows.map((row) => row[1])).size).toBe(1234);
    expect(result.rows[0]![6]).toBe('Imported');
  });

  it('writes a cell that starts like a formula as plain text, and keeps phone numbers exactly', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok(
      'POST',
      '/contacts',
      { name: '=HYPERLINK("http://evil.example","click")', phone: '+919847012345' },
      201,
    );
    await owner.ok('POST', '/contacts', { name: '@SUM(A1:A9)', email: 'x@y.example' }, 201);
    const result = await exportList(owner, 'contact');
    const names = result.rows.map((row) => row[0]).sort();
    expect(names).toEqual(['\'=HYPERLINK("http://evil.example","click")', "'@SUM(A1:A9)"].sort());
    expect(result.rows.find((row) => row[2] === '')![1]).toBe('+919847012345');
  });

  it('leaves out the answers of a removed field and shows the business’s live fields only', async () => {
    const { owner } = await business();
    const field = (await owner.ok('GET', '/fields?object=contact')).items[0];
    await owner.ok('DELETE', `/fields/${field.id}`, undefined, 204);
    const result = await exportList(owner, 'contact');
    expect(result.headers).not.toContain('Car model');
    expect(JSON.stringify(result.rows)).not.toContain('Swift');
  });
});

describe('who and when', () => {
  it('is for managers only (403) on all three routes, and for the manager’s own business only (404 for another’s)', async () => {
    const { owner } = await business();
    const staff = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff' });
    const requested = await owner.ok('POST', '/exports', { object: 'contact' }, 202);
    await staff.refused('POST', '/exports', { object: 'contact' }, 403);
    await staff.refused('GET', `/exports/${requested.id}`, undefined, 403);
    await staff.refused('GET', `/exports/${requested.id}/download`, undefined, 403);
    const stranger = await signUpOwner(app, database);
    await stranger.refused('GET', `/exports/${requested.id}`, undefined, 404);
    await stranger.refused('GET', `/exports/${requested.id}/download`, undefined, 404);
    await owner.refused('GET', '/exports/0194c9a8-0000-7000-8000-000000000000', undefined, 404);
    await owner.refused('GET', '/exports/not-an-id', undefined, 400);
  });

  it('is not given to someone who is not signed in (401)', async () => {
    const { owner } = await business();
    const requested = await owner.ok('POST', '/exports', { object: 'contact' }, 202);
    for (const [method, url] of [
      ['POST', '/api/v1/exports'],
      ['GET', `/api/v1/exports/${requested.id}`],
      ['GET', `/api/v1/exports/${requested.id}/download`],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { origin: 'http://localhost:3000', 'x-requested-with': 'toobler-web' },
        ...(method === 'POST' ? { payload: { object: 'contact' } } : {}),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('refuses a query the list does not take (400 INVALID_QUERY), the board of leads, an unknown list and extra words (400)', async () => {
    const { owner } = await business();
    expect(await owner.refused('POST', '/exports', { object: 'contact', query: 'lifecycleStage=nonsense' }, 400)).toBe(
      'INVALID_QUERY',
    );
    expect(await owner.refused('POST', '/exports', { object: 'lead', query: 'view=board' }, 400)).toBe('INVALID_QUERY');
    await owner.refused('POST', '/exports', { object: 'tickets' }, 400);
    await owner.refused('POST', '/exports', { object: 'contact', extra: 1 }, 400);
    await owner.refused('POST', '/exports', {}, 400);
  });

  it('fails plainly when the filters are bad, with no file to download (409)', async () => {
    const { owner } = await business();
    const requested = await owner
      .ok('POST', '/exports', { object: 'contact', query: 'filters=oops' }, 202)
      .catch(() => undefined);
    // The job raises the error (the runner would retry); the export is marked failed in words
    const exports = await database.system
      .selectFrom('exports')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .execute();
    expect(requested).toBeUndefined();
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ status: 'failed' });
    expect(exports[0]!.error).toContain('could not be built');
    expect(await owner.refused('GET', `/exports/${exports[0]!.id}/download`, undefined, 409)).toBe('EXPORT_NOT_READY');
  });

  it('is gone after 24 hours (410) and the file is deleted by the clean-up', async () => {
    const { owner } = await business();
    const result = await exportList(owner, 'contact');
    await database.system
      .updateTable('exports')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', result.requested.id)
      .execute();
    expect(await owner.refused('GET', `/exports/${result.requested.id}/download`, undefined, 410)).toBe(
      'EXPORT_EXPIRED',
    );
    expect((await owner.ok('GET', `/exports/${result.requested.id}`)).downloadPath).toBeNull();
    const { deleteExpiredContent } = await import('../src/modules/core/exports/repositories/exports.repository');
    const deleted = await database.runInAccountTransaction(owner.businessId, (transaction) =>
      deleteExpiredContent(transaction, owner.businessId, new Date()),
    );
    expect(deleted).toBe(1);
    const stored = await database.system
      .selectFrom('exports')
      .select(['content', 'status'])
      .where('id', '=', result.requested.id)
      .executeTakeFirstOrThrow();
    expect(stored.content).toBeNull();
  });

  it('emails the manager a link to the page that downloads it, and a failed email never loses the export', async () => {
    const { owner } = await business();
    mail.sent.length = 0;
    const result = await exportList(owner, 'contact');
    const message = mail.sent.find((sent) => sent.to === owner.email)!;
    expect(message.subject).toContain('Your export is ready');
    expect(message.text).toContain(`/exports/${result.requested.id}`);
    expect(message.text).toContain('24 hours');
    // The email holds no contact's details
    expect(message.text + message.html).not.toContain('priya@menon');

    mail.failNextSends(true);
    const requested = await owner.send('POST', '/exports', { object: 'contact' });
    mail.failNextSends(false);
    // The enqueue ran the job, which raised the mail error after saving the file: the export is there and downloadable
    expect([202, 500]).toContain(requested.statusCode);
    const exports = await database.system
      .selectFrom('exports')
      .select(['status', 'id'])
      .where('account_id', '=', owner.businessId)
      .orderBy('created_at', 'desc')
      .execute();
    expect(exports[0]!.status).toBe('done');
    expect((await owner.send('GET', `/exports/${exports[0]!.id}/download`)).statusCode).toBe(200);
  });

  it('writes an activity line for the request, the finish and each download, with no contents', async () => {
    const { owner } = await business();
    const result = await exportList(owner, 'contact');
    const kinds = (
      await database.system
        .selectFrom('activity_log')
        .select('kind')
        .where('account_id', '=', owner.businessId)
        .where('kind', 'like', 'exports.%')
        .execute()
    )
      .map((line) => line.kind)
      .sort();
    expect(kinds).toEqual(['exports.downloaded', 'exports.finished', 'exports.requested']);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', 'like', 'exports.%')
      .execute();
    expect(JSON.stringify(lines)).not.toContain('Priya');
    expect(result.rows).toHaveLength(2);
  });
});
