import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F05 slice 2: one company with its people and leads, and putting a contact in a company (or taking it out).

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

async function addContact(owner: TeamMember, name: string) {
  return owner.ok('POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
}

describe('PUT /api/v1/contacts/{id}/company', () => {
  it('puts a contact in a company, shows it on the contact and the company, and takes it out again', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const priya = await addContact(owner, 'Priya Menon');
    expect(priya.companyId).toBeNull();

    const linked = await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
    expect(linked).toMatchObject({ id: priya.id, companyId: company.id });
    expect((await owner.ok('GET', `/contacts/${priya.id}`)).companyId).toBe(company.id);
    expect(
      (await owner.ok('GET', `/companies/${company.id}`)).contacts.map((contact: { id: string }) => contact.id),
    ).toEqual([priya.id]);
    expect((await owner.ok('GET', '/companies')).items[0].contactCount).toBe(1);

    const unlinked = await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: null });
    expect(unlinked.companyId).toBeNull();
    expect((await owner.ok('GET', `/companies/${company.id}`)).contacts).toEqual([]);
  });

  it('moves a contact from one company to another (a contact belongs to at most one)', async () => {
    const owner = await signUpOwner(app, database);
    const first = await owner.ok('POST', '/companies', { name: 'First Ltd' }, 201);
    const second = await owner.ok('POST', '/companies', { name: 'Second Ltd' }, 201);
    const priya = await addContact(owner, 'Priya Menon');
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: first.id });
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: second.id });
    expect((await owner.ok('GET', `/companies/${first.id}`)).contacts).toEqual([]);
    expect((await owner.ok('GET', `/companies/${second.id}`)).contacts).toHaveLength(1);
  });

  it('writes one log line and one event when it changes, none when nothing changes, and no words in either', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Secret Firm Name' }, 201);
    const priya = await addContact(owner, 'Priya Menon');
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });

    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'contacts.company_changed')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).not.toContain('Secret Firm Name');
    const events = await database.system
      .selectFrom('domain_events')
      .select('payload')
      .where('account_id', '=', owner.businessId)
      .where('name', '=', 'contact.company_changed')
      .execute();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toMatchObject({ contactId: priya.id, fromCompanyId: null, toCompanyId: company.id });
    expect(JSON.stringify(events[0])).not.toContain('Secret Firm Name');
  });

  it('answers 404 for an unknown, deleted or another business’s contact or company, and 400 for a bad request', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const strangersCompany = await stranger.ok('POST', '/companies', { name: 'Other Ltd' }, 201);
    const strangersContact = await addContact(stranger, 'Stranger');
    const priya = await addContact(owner, 'Priya Menon');
    const deleted = await addContact(owner, 'Deleted');
    await owner.ok('DELETE', `/contacts/${deleted.id}`, undefined, 204);

    await owner.refused('PUT', `/contacts/${priya.id}/company`, { companyId: strangersCompany.id }, 404);
    await owner.refused('PUT', `/contacts/${priya.id}/company`, { companyId: randomUUID() }, 404);
    await owner.refused('PUT', `/contacts/${strangersContact.id}/company`, { companyId: company.id }, 404);
    await owner.refused('PUT', `/contacts/${randomUUID()}/company`, { companyId: company.id }, 404);
    await owner.refused('PUT', `/contacts/${deleted.id}/company`, { companyId: company.id }, 404);
    await owner.refused('PUT', `/contacts/${priya.id}/company`, {}, 400);
    await owner.refused('PUT', `/contacts/${priya.id}/company`, { companyId: 'nope' }, 400);
    await owner.refused('PUT', `/contacts/${priya.id}/company`, { companyId: company.id, name: 'x' }, 400);
    await owner.refused('PUT', '/contacts/not-an-id/company', { companyId: company.id }, 400);
    // Nothing changed for the stranger
    expect((await stranger.ok('GET', `/contacts/${strangersContact.id}`)).companyId).toBeNull();
  });

  it('needs a sign-in (401), and is open to every role', async () => {
    const owner = await signUpOwner(app, database);
    const staffOwn = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const priya = await addContact(owner, 'Priya Menon');
    await staffOwn.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
    const nobody = await app.inject({
      method: 'PUT',
      url: `/api/v1/contacts/${priya.id}/company`,
      headers: unsafeRequestHeaders,
      payload: { companyId: company.id },
    });
    expect(nobody.statusCode).toBe(401);
  });
});

describe('GET /api/v1/companies/{id}', () => {
  it('shows the company with its people, their leads (newest first) and the numbers', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok(
      'POST',
      '/companies',
      { name: 'Infosys HR', domain: 'infosys.com', city: 'Pune' },
      201,
    );
    const priya = await addContact(owner, 'Priya Menon');
    const meera = await addContact(owner, 'Meera Pillai');
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
    await owner.ok('PUT', `/contacts/${meera.id}/company`, { companyId: company.id });
    const openLead = await owner.ok('POST', '/leads', { contactId: priya.id, interest: 'Rooms' }, 201);
    const wonLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: meera.id, interest: 'Hall', budgetPaise: 2_000_000 },
      201,
    );
    const pipeline = await owner.ok('GET', '/pipeline');
    const wonStage = pipeline.stages.find((stage: { kind: string }) => stage.kind === 'won');
    await owner.ok('POST', `/leads/${wonLead.id}/move`, { stageId: wonStage.id });

    const detail = await owner.ok('GET', `/companies/${company.id}`);
    expect(detail).toMatchObject({
      name: 'Infosys HR',
      domain: 'infosys.com',
      city: 'Pune',
      contactCount: 2,
      openLeads: 1,
      wonValuePaise: 2_000_000,
    });
    expect(detail.contacts.map((contact: { name: string }) => contact.name)).toEqual(['Meera Pillai', 'Priya Menon']);
    expect(detail.leads.map((lead: { id: string }) => lead.id)).toEqual([wonLead.id, openLead.id]);
    expect(detail.leads[0]).toMatchObject({
      contactId: meera.id,
      stageKind: 'won',
      interest: 'Hall',
      budgetPaise: 2_000_000,
    });
    expect(detail.leads[1]).toMatchObject({ contactId: priya.id, stageKind: 'open' });
  });

  it('leaves out deleted contacts and their leads', async () => {
    const owner = await signUpOwner(app, database);
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const priya = await addContact(owner, 'Priya Menon');
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
    await owner.ok('DELETE', `/contacts/${priya.id}`, undefined, 204);
    const detail = await owner.ok('GET', `/companies/${company.id}`);
    expect(detail.contacts).toEqual([]);
    expect(detail.contactCount).toBe(0);
  });

  it('shows the "own leads only" role only the leads it owns, and counts only those', async () => {
    const owner = await signUpOwner(app, database);
    const rahul = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    const company = await owner.ok('POST', '/companies', { name: 'Infosys HR' }, 201);
    const priya = await addContact(owner, 'Priya Menon');
    const meera = await addContact(owner, 'Meera Pillai');
    await owner.ok('PUT', `/contacts/${priya.id}/company`, { companyId: company.id });
    await owner.ok('PUT', `/contacts/${meera.id}/company`, { companyId: company.id });
    const rahulsLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: priya.id, interest: 'Rahuls', ownerUserId: rahul.userId },
      201,
    );
    const ownersLead = await owner.ok(
      'POST',
      '/leads',
      { contactId: meera.id, interest: 'Owners', ownerUserId: owner.userId },
      201,
    );

    const asOwner = await owner.ok('GET', `/companies/${company.id}`);
    expect(asOwner.leads.map((lead: { id: string }) => lead.id).sort()).toEqual([rahulsLead.id, ownersLead.id].sort());
    expect(asOwner.openLeads).toBe(2);

    const asRahul = await rahul.ok('GET', `/companies/${company.id}`);
    expect(asRahul.leads.map((lead: { id: string }) => lead.id)).toEqual([rahulsLead.id]);
    expect(asRahul.openLeads).toBe(1);
    // Contacts are shared work, so the people are all listed
    expect(asRahul.contacts).toHaveLength(2);
    expect((await rahul.ok('GET', '/companies')).items[0].openLeads).toBe(1);
  });

  it('answers 404 for an unknown, deleted-contact-only or another business’s company, and 400 for a bad id; 401 for nobody', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const strangersCompany = await stranger.ok('POST', '/companies', { name: 'Other Ltd' }, 201);
    await owner.refused('GET', `/companies/${strangersCompany.id}`, undefined, 404);
    await owner.refused('GET', `/companies/${randomUUID()}`, undefined, 404);
    await owner.refused('GET', '/companies/not-an-id', undefined, 400);
    const nobody = await app.inject({ method: 'GET', url: `/api/v1/companies/${strangersCompany.id}` });
    expect(nobody.statusCode).toBe(401);
  });
});
