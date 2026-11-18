import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner } from './support/team';

// F05 slice 1: adding a company and listing companies. Whole stories by real people, plus the usual refusals and the fence between businesses.

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

const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

describe('POST /api/v1/companies', () => {
  it('adds a company the signed-in person looks after, with its phone in international form', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok(
      'POST',
      '/companies',
      { name: '  Infosys HR ', domain: 'https://www.Infosys.com/careers', phone: '098470 12345', city: 'Bengaluru' },
      201,
    );
    expect(company).toMatchObject({
      name: 'Infosys HR',
      domain: 'infosys.com',
      phone: '+919847012345',
      city: 'Bengaluru',
      owner: { userId: owner.userId, name: 'Anita Nair' },
      contactCount: 0,
      openLeads: 0,
      wonValuePaise: 0,
    });
    expect(company.id).toBeTruthy();
  });

  it('needs only a name, and lets another person be the owner', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const company = await owner.ok('POST', '/companies', { name: 'Nair Travels', ownerUserId: rahul.userId }, 201);
    expect(company).toMatchObject({
      domain: null,
      phone: null,
      city: null,
      owner: { userId: rahul.userId, name: 'Rahul Das' },
    });
  });

  it('works for staff and own-leads-only staff too', async () => {
    const owner = await signUpOwner(app, database);
    const staffOwn = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    await staffOwn.ok('POST', '/companies', { name: 'Staff Made Ltd' }, 201);
  });

  it('refuses a name a live company already has, ignoring capital letters and spaces (409 naming it)', async () => {
    const owner = await signUpOwner(app, database);
    const first = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    for (const name of ['infosys hr', 'INFOSYSHR', ' Infosys   HR ']) {
      const response = await owner.send('POST', '/companies', { name });
      expect(response.statusCode, name).toBe(409);
      expect(response.json().error.code).toBe('COMPANY_EXISTS');
      expect(response.json().error.details).toEqual({ companyId: first.id });
    }
    // Another business may use the same name
    const other = await signUpOwner(app, database);
    await other.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
  });

  it('refuses a work domain a live company already has (409)', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/companies', { name: 'Infosys HR', domain: 'infosys.com' }, 201);
    expect(await owner.refused('POST', '/companies', { name: 'Infosys Finance', domain: 'www.infosys.com' }, 409)).toBe(
      'COMPANY_DOMAIN_EXISTS',
    );
  });

  it('refuses a free-mail domain (400): gmail.com says nothing about a firm', async () => {
    const owner = await signUpOwner(app, database);
    for (const domain of ['gmail.com', 'Yahoo.com', 'https://outlook.com']) {
      expect(await owner.refused('POST', '/companies', { name: 'Some Firm', domain }, 400)).toBe('FREE_MAIL_DOMAIN');
    }
    expect((await owner.ok('GET', '/companies')).items).toEqual([]);
  });

  it('refuses a bad request (400): no name, a blank name, a too long name, a bad domain, a bad phone, an unknown field', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('POST', '/companies', {}, 400);
    await owner.refused('POST', '/companies', { name: '   ' }, 400);
    await owner.refused('POST', '/companies', { name: 'x'.repeat(121) }, 400);
    await owner.refused('POST', '/companies', { name: 'A', domain: 'not a domain' }, 400);
    expect(await owner.refused('POST', '/companies', { name: 'A', phone: '12' }, 400)).toBe('INVALID_PHONE');
    await owner.refused('POST', '/companies', { name: 'A', accountId: randomUUID() }, 400);
  });

  it('answers 404 for an owner who is not a person of the business', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    expect(await owner.refused('POST', '/companies', { name: 'A', ownerUserId: stranger.userId }, 404)).toBe(
      'NOT_FOUND',
    );
    expect(await owner.refused('POST', '/companies', { name: 'A', ownerUserId: randomUUID() }, 404)).toBe('NOT_FOUND');
  });

  it('needs a sign-in (401)', async () => {
    const nobody = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: unsafeRequestHeaders,
      payload: { name: 'A' },
    });
    expect(nobody.statusCode).toBe(401);
  });

  it('writes the activity log without the company’s words', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/companies', { name: 'Secret Firm Name' }, 201);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'companies.created')
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(line)).not.toContain('Secret Firm Name');
  });
});

describe('GET /api/v1/companies', () => {
  it('lists the business’s companies, newest change first, never another business’s', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/companies', { name: 'Alpha Ltd' }, 201);
    await owner.ok('POST', '/companies', { name: 'Beta Ltd' }, 201);
    const stranger = await signUpOwner(app, database);
    await stranger.ok('POST', '/companies', { name: 'Strangers Ltd' }, 201);

    const answer = await owner.ok('GET', '/companies');
    expect(answer.items.map((company: { name: string }) => company.name)).toEqual(['Beta Ltd', 'Alpha Ltd']);
    expect(answer).toMatchObject({ total: 2, page: 1, limit: 25 });
  });

  it('searches by name, domain or city, and finds a company by its exact domain', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/companies', { name: 'Infosys HR', domain: 'infosys.com', city: 'Bengaluru' }, 201);
    await owner.ok('POST', '/companies', { name: 'Nair Travels', domain: 'nairtravels.in', city: 'Kochi' }, 201);

    const names = async (path: string) =>
      (await owner.ok('GET', path)).items.map((company: { name: string }) => company.name);
    expect(await names('/companies?q=infosys')).toEqual(['Infosys HR']);
    expect(await names('/companies?q=kochi')).toEqual(['Nair Travels']);
    expect(await names('/companies?q=nairtravels')).toEqual(['Nair Travels']);
    expect(await names('/companies?domain=INFOSYS.com')).toEqual(['Infosys HR']);
    expect(await names('/companies?domain=other.com')).toEqual([]);
    // A search with % or _ in it is plain text, not a pattern
    expect(await names('/companies?q=%25')).toEqual([]);
  });

  it('pages', async () => {
    const owner = await signUpOwner(app, database);
    for (const name of ['One', 'Two', 'Three']) await owner.ok('POST', '/companies', { name }, 201);
    const first = await owner.ok('GET', '/companies?limit=2&page=1');
    const second = await owner.ok('GET', '/companies?limit=2&page=2');
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(first.total).toBe(3);
  });

  it('adds up the people of each company: contacts, open leads and the budget of won leads', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const priya = await owner.ok('POST', '/contacts', { name: 'Priya', phone: uniqueUaeNumber() }, 201);
    const meera = await owner.ok('POST', '/contacts', { name: 'Meera', phone: uniqueUaeNumber() }, 201);
    await database.system
      .updateTable('contacts')
      .set({ company_id: company.id })
      .where('id', 'in', [priya.id, meera.id])
      .execute();
    await owner.ok('POST', '/leads', { contactId: priya.id, interest: 'Room' }, 201);
    const wonLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: meera.id, interest: 'Hall', budgetPaise: 1_500_000 },
      201,
    );
    const pipeline = await owner.ok('GET', '/pipeline');
    const wonStage = pipeline.stages.find((stage: { kind: string }) => stage.kind === 'won');
    await owner.ok('POST', `/leads/${wonLead.id}/move`, { stageId: wonStage.id });

    const answer = await owner.ok('GET', '/companies');
    expect(answer.items[0]).toMatchObject({ contactCount: 2, openLeads: 1, wonValuePaise: 1_500_000 });
  });

  it('refuses bad paging and a bad domain filter (400) and needs a sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('GET', '/companies?page=0', undefined, 400);
    await owner.refused('GET', '/companies?limit=1000', undefined, 400);
    await owner.refused('GET', '/companies?domain=not%20a%20domain', undefined, 400);
    const nobody = await app.inject({ method: 'GET', url: '/api/v1/companies' });
    expect(nobody.statusCode).toBe(401);
  });
});
