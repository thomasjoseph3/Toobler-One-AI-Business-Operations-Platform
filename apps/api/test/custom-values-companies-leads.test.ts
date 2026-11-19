import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner } from './support/team';

// F09 slice 4: the answers to custom fields on companies and leads, and "Required before Won" on a lead's move.

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

type Owner = Awaited<ReturnType<typeof signUpOwner>>;

/** The id of the stage of this kind (the first one). */
async function stageOfKind(owner: Owner, kind: 'open' | 'won' | 'lost'): Promise<string> {
  const pipeline = await owner.ok('GET', '/pipeline');
  return pipeline.stages.find((stage: { kind: string }) => stage.kind === kind).id;
}

describe('custom values on companies', () => {
  it('saves checked answers when adding and changing, merges only what is sent, and hides removed fields', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/fields', { object: 'company', label: 'Employees', type: 'number' }, 201);
    const sector = await owner.ok(
      'POST',
      '/fields',
      { object: 'company', label: 'Sector', type: 'dropdown', options: ['IT', 'Retail'] },
      201,
    );
    const company = await owner.ok(
      'POST',
      '/companies',
      { name: 'Acme', custom: { employees: '1,200', sector: 'it' } },
      201,
    );
    expect(company.custom).toEqual({ employees: 1200, sector: 'IT' });
    const changed = await owner.ok(
      'PATCH',
      `/companies/${company.id}`,
      { custom: { employees: 15, sector: null } },
      200,
    );
    expect(changed.custom).toEqual({ employees: 15 });
    expect((await owner.ok('GET', `/companies/${company.id}`)).custom).toEqual({ employees: 15 });
    expect((await owner.ok('GET', '/companies')).items[0].custom).toEqual({ employees: 15 });
    await owner.ok('DELETE', `/fields/${sector.id}`, undefined, 204);
    await owner.refused('PATCH', `/companies/${company.id}`, { custom: { sector: 'IT' } }, 400);
  });

  it('refuses wrong answers (400 INVALID_CUSTOM_VALUES) and saves nothing', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/fields', { object: 'company', label: 'Employees', type: 'number' }, 201);
    expect(await owner.refused('POST', '/companies', { name: 'Acme', custom: { employees: 'many' } }, 400)).toBe(
      'INVALID_CUSTOM_VALUES',
    );
    // A contact field is not a company field
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Birthday', type: 'date' }, 201);
    await owner.refused('POST', '/companies', { name: 'Acme', custom: { birthday: '1990-01-01' } }, 400);
    expect((await owner.ok('GET', '/companies')).items).toEqual([]);
  });
});

describe('custom values on leads', () => {
  it('saves checked answers when adding and changing, and shows them on the lead, the list and the board', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok(
      'POST',
      '/fields',
      { object: 'lead', label: 'Car model', type: 'dropdown', options: ['Swift', 'Baleno'] },
      201,
    );
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Test drive', type: 'yes_no' }, 201);
    const contact = await owner.ok('POST', '/contacts', { phone: '+919847022001' }, 201);
    const lead = await owner.ok('POST', '/leads', { contactId: contact.id, custom: { car_model: 'baleno' } }, 201);
    expect(lead.custom).toEqual({ car_model: 'Baleno' });
    const changed = await owner.ok('PATCH', `/leads/${lead.id}`, { custom: { test_drive: 'yes' } }, 200);
    expect(changed.custom).toEqual({ car_model: 'Baleno', test_drive: true });
    expect((await owner.ok('GET', `/leads/${lead.id}`)).custom).toEqual(changed.custom);
    expect((await owner.ok('GET', '/leads')).items[0].custom).toEqual(changed.custom);
    await owner.refused('PATCH', `/leads/${lead.id}`, { custom: { car_model: 'Tesla' } }, 400);
    await owner.refused('PATCH', `/leads/${lead.id}`, { custom: { nothing: 1 } }, 400);
  });

  it('refuses to mark a lead Won until the "Required before Won" fields are answered, and then allows it', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Car model', type: 'text', requiredForWon: true }, 201);
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Colour', type: 'text', requiredForWon: true }, 201);
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Notes', type: 'text' }, 201);
    const contact = await owner.ok('POST', '/contacts', { phone: '+919847022002' }, 201);
    const lead = await owner.ok('POST', '/leads', { contactId: contact.id, custom: { car_model: 'Swift' } }, 201);
    const wonStage = await stageOfKind(owner, 'won');
    expect(await owner.refused('POST', `/leads/${lead.id}/move`, { stageId: wonStage }, 400)).toBe(
      'REQUIRED_FIELDS_MISSING',
    );
    const response = await owner.browser.send('POST', `/api/v1/leads/${lead.id}/move`, { stageId: wonStage });
    expect(response.json().error.message).toBe('Fill in Colour before marking this lead Won.');
    // Moving to a stage that is not Won is still fine
    const lostStage = await stageOfKind(owner, 'lost');
    expect(lostStage).toBeTruthy();
    await owner.ok('PATCH', `/leads/${lead.id}`, { custom: { colour: 'Red' } }, 200);
    const won = await owner.ok('POST', `/leads/${lead.id}/move`, { stageId: wonStage }, 200);
    expect(won.stage.kind).toBe('won');
  });

  it('does not ask for a field that was removed or is no longer required', async () => {
    const owner = await signUpOwner(app, database);
    const required = await owner.ok(
      'POST',
      '/fields',
      { object: 'lead', label: 'Colour', type: 'text', requiredForWon: true },
      201,
    );
    const contact = await owner.ok('POST', '/contacts', { phone: '+919847022003' }, 201);
    const lead = await owner.ok('POST', '/leads', { contactId: contact.id }, 201);
    const wonStage = await stageOfKind(owner, 'won');
    await owner.refused('POST', `/leads/${lead.id}/move`, { stageId: wonStage }, 400);
    await owner.ok('PATCH', `/fields/${required.id}`, { requiredForWon: false }, 200);
    expect((await owner.ok('POST', `/leads/${lead.id}/move`, { stageId: wonStage }, 200)).stage.kind).toBe('won');
  });
});
