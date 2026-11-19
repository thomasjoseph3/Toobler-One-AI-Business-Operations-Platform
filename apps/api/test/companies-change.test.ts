import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import type { DomainEvent } from '../src/kernel/events/events';
import { handleTeamMemberRemoved } from '../src/modules/core/companies/services/team-events.service';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F05 slice 3: changing a company, and deleting it (which keeps its people).

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

async function addPersonTo(owner: TeamMember, companyId: string, name: string) {
  const contact = await owner.ok('POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
  await owner.ok('PUT', `/contacts/${contact.id}/company`, { companyId });
  return contact;
}

describe('PATCH /api/v1/companies/{id}', () => {
  it('changes only the fields sent, and the numbers about its people stay', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok(
      'POST',
      '/companies',
      { name: 'Infosys HR', domain: 'infosys.com', city: 'Pune' },
      201,
    );
    await addPersonTo(owner, company.id, 'Priya Menon');

    const changed = await owner.ok('PATCH', `/companies/${company.id}`, { city: 'Bengaluru', phone: '098470 12345' });
    expect(changed).toMatchObject({
      name: 'Infosys HR',
      domain: 'infosys.com',
      city: 'Bengaluru',
      phone: '+919847012345',
      contactCount: 1,
    });
    expect((await owner.ok('GET', `/companies/${company.id}`)).city).toBe('Bengaluru');
  });

  it('renames a company (capitals and spaces do not matter for its own name), and clears a field with null or blank text', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok(
      'POST',
      '/companies',
      { name: 'Infosys HR', domain: 'infosys.com', city: 'Pune' },
      201,
    );
    expect((await owner.ok('PATCH', `/companies/${company.id}`, { name: 'INFOSYS  hr' })).name).toBe('INFOSYS  hr');
    const cleared = await owner.ok('PATCH', `/companies/${company.id}`, { domain: null, city: '  ' });
    expect(cleared).toMatchObject({ domain: null, city: null });
  });

  it('gives a company to another person, or to nobody', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    expect((await owner.ok('PATCH', `/companies/${company.id}`, { ownerUserId: rahul.userId })).owner).toEqual({
      userId: rahul.userId,
      name: 'Rahul Das',
    });
    expect((await owner.ok('PATCH', `/companies/${company.id}`, { ownerUserId: null })).owner).toBeNull();
  });

  it('refuses another company’s name or domain (409 naming it), a free-mail domain and a bad phone (400), and an owner of another business (404)', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const first = await owner.ok('POST', '/companies', { name: 'First Ltd', domain: 'first.com' }, 201);
    const second = await owner.ok('POST', '/companies', { name: 'Second Ltd' }, 201);
    expect(await owner.refused('PATCH', `/companies/${second.id}`, { name: 'first ltd' }, 409)).toBe('COMPANY_EXISTS');
    expect(await owner.refused('PATCH', `/companies/${second.id}`, { domain: 'www.first.com' }, 409)).toBe(
      'COMPANY_DOMAIN_EXISTS',
    );
    expect(await owner.refused('PATCH', `/companies/${second.id}`, { domain: 'gmail.com' }, 400)).toBe(
      'FREE_MAIL_DOMAIN',
    );
    expect(await owner.refused('PATCH', `/companies/${second.id}`, { phone: '12' }, 400)).toBe('INVALID_PHONE');
    expect(await owner.refused('PATCH', `/companies/${second.id}`, { ownerUserId: stranger.userId }, 404)).toBe(
      'NOT_FOUND',
    );
    // Nothing changed
    expect((await owner.ok('GET', `/companies/${second.id}`)).name).toBe('Second Ltd');
    expect((await owner.ok('GET', `/companies/${first.id}`)).domain).toBe('first.com');
  });

  it('refuses a bad request (400): nothing to change, an emptied name, an unknown field, a bad id', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    await owner.refused('PATCH', `/companies/${company.id}`, {}, 400);
    await owner.refused('PATCH', `/companies/${company.id}`, { name: '   ' }, 400);
    await owner.refused('PATCH', `/companies/${company.id}`, { accountId: randomUUID() }, 400);
    await owner.refused('PATCH', `/companies/${company.id}`, { domain: 'not a domain' }, 400);
    await owner.refused('PATCH', '/companies/not-an-id', { city: 'Pune' }, 400);
  });

  it('answers 404 for an unknown, deleted or another business’s company, and 401 for nobody; staff may change a company', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const strangersCompany = await stranger.ok('POST', '/companies', { name: 'Other Ltd' }, 201);
    await owner.refused('PATCH', `/companies/${strangersCompany.id}`, { city: 'Hijack' }, 404);
    await owner.refused('PATCH', `/companies/${randomUUID()}`, { city: 'Pune' }, 404);
    await staff.ok('PATCH', `/companies/${company.id}`, { city: 'Pune' });
    await owner.ok('DELETE', `/companies/${company.id}`, undefined, 204);
    await owner.refused('PATCH', `/companies/${company.id}`, { city: 'Goa' }, 404);
    const nobody = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${company.id}`,
      headers: unsafeRequestHeaders,
      payload: { city: 'x' },
    });
    expect(nobody.statusCode).toBe(401);
    expect((await stranger.ok('GET', `/companies/${strangersCompany.id}`)).city).toBeNull();
  });

  it('logs field names only', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    await owner.ok('PATCH', `/companies/${company.id}`, { city: 'Secret City Name' });
    await owner.ok('PATCH', `/companies/${company.id}`, { city: 'Secret City Name' });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'companies.updated')
      .execute();
    // The second, identical change changed nothing, so it is not logged
    expect(lines).toHaveLength(1);
    expect(lines[0]!.fields).toEqual(['city']);
    expect(JSON.stringify(lines[0])).not.toContain('Secret City Name');
  });
});

describe('DELETE /api/v1/companies/{id}', () => {
  it('deletes the company and keeps its people, who just lose the link; the name can be used again', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR', domain: 'infosys.com' }, 201);
    const priya = await addPersonTo(owner, company.id, 'Priya Menon');
    const meera = await addPersonTo(owner, company.id, 'Meera Pillai');

    await owner.ok('DELETE', `/companies/${company.id}`, undefined, 204);

    await owner.refused('GET', `/companies/${company.id}`, undefined, 404);
    expect((await owner.ok('GET', '/companies')).items).toEqual([]);
    for (const person of [priya, meera]) {
      const contact = await owner.ok('GET', `/contacts/${person.id}`);
      expect(contact).toMatchObject({ id: person.id, companyId: null });
    }
    const again = await owner.ok('POST', '/companies', { name: 'Infosys HR', domain: 'infosys.com' }, 201);
    expect(again.id).not.toBe(company.id);
  });

  it('is for managers only (403), needs a sign-in (401) and answers 404 for another business’s company or a second delete', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const strangersCompany = await stranger.ok('POST', '/companies', { name: 'Other Ltd' }, 201);
    await staff.refused('DELETE', `/companies/${company.id}`, undefined, 403);
    await owner.refused('DELETE', `/companies/${strangersCompany.id}`, undefined, 404);
    await owner.ok('DELETE', `/companies/${company.id}`, undefined, 204);
    await owner.refused('DELETE', `/companies/${company.id}`, undefined, 404);
    await owner.refused('DELETE', '/companies/not-an-id', undefined, 400);
    const nobody = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${strangersCompany.id}`,
      headers: unsafeRequestHeaders,
    });
    expect(nobody.statusCode).toBe(401);
    expect((await stranger.ok('GET', `/companies/${strangersCompany.id}`)).name).toBe('Other Ltd');
  });

  it('logs and publishes ids only', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Secret Firm Name' }, 201);
    await owner.ok('DELETE', `/companies/${company.id}`, undefined, 204);
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'company.deleted')
      .execute();
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]!.payload as object).sort()).toEqual(['by', 'companyId']);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'companies.deleted')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).not.toContain('Secret Firm Name');
  });
});

describe('a person who leaves the business', () => {
  it('hands the companies they looked after to the person the manager chose', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR', ownerUserId: rahul.userId }, 201);
    await owner.ok('DELETE', `/team/members/${rahul.userId}`, undefined, 204);

    const rows = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'team.member_removed')
      .execute();
    const contextFor = createContextFactory(database);
    for (const row of rows) {
      const event: DomainEvent = {
        id: row.id,
        accountId: row.account_id,
        name: row.name,
        payload: row.payload as Record<string, unknown>,
        occurredAt: row.occurred_at,
      };
      await handleTeamMemberRemoved(event, contextFor(owner.businessId, { kind: 'system', id: 'test' }));
      // Delivered twice: still fine
      await handleTeamMemberRemoved(event, contextFor(owner.businessId, { kind: 'system', id: 'test' }));
    }
    expect((await owner.ok('GET', `/companies/${company.id}`)).owner).toEqual({
      userId: owner.userId,
      name: 'Anita Nair',
    });
  });
});
