import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner, uniqueUaeNumber, type TeamMember } from './support/team';

// F11 slice 4a: the filter engine on the Leads list: `GET /leads?filters=[...]` with the temperature and the business's own custom fields.

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

type Condition = { field: string; operator: string; value?: string | number | boolean };
const filtersQuery = (conditions: unknown) => `filters=${encodeURIComponent(JSON.stringify(conditions))}`;

/** A business with one custom field of every kind and four leads with different answers and temperatures. */
async function businessWithLeads() {
  const owner = await signUpOwner(app, database);
  await owner.ok('POST', '/fields', { object: 'lead', label: 'Note', type: 'text' }, 201);
  await owner.ok('POST', '/fields', { object: 'lead', label: 'Guests', type: 'number' }, 201);
  await owner.ok('POST', '/fields', { object: 'lead', label: 'Wedding', type: 'date' }, 201);
  await owner.ok(
    'POST',
    '/fields',
    { object: 'lead', label: 'Car', type: 'dropdown', options: ['Swift', 'Baleno'] },
    201,
  );
  await owner.ok('POST', '/fields', { object: 'lead', label: 'VIP', type: 'yes_no' }, 201);

  const makeLead = async (name: string, custom: Record<string, unknown>, temperature?: 'hot' | 'warm' | 'cold') => {
    const contact = await owner.ok('POST', '/contacts', { name, phone: uniqueUaeNumber() }, 201);
    const lead = await owner.ok('POST', '/leads', { contactId: contact.id, custom }, 201);
    if (temperature) await owner.ok('PATCH', `/leads/${lead.id}/temperature`, { temperature });
    return lead.id as string;
  };
  const alpha = await makeLead(
    'Alpha',
    { note: 'Garden wedding', guests: 50, wedding: '2026-12-10', car: 'Swift', vip: true },
    'hot',
  );
  const beta = await makeLead(
    'Beta',
    { note: 'Hall only', guests: 200, wedding: '2027-02-01', car: 'Baleno', vip: false },
    'warm',
  );
  const gamma = await makeLead('Gamma', { guests: 120 }, 'cold');
  const delta = await makeLead('Delta', {});
  return { owner, alpha, beta, gamma, delta };
}

async function idsFor(owner: TeamMember, conditions: Condition[], extra = '') {
  const found = await owner.ok('GET', `/leads?${filtersQuery(conditions)}${extra}&limit=100`);
  return (found.items as Array<{ id: string }>).map((lead) => lead.id).sort();
}

describe('GET /leads?filters=', () => {
  it('filters on the temperature (is, is not, unscored)', async () => {
    const { owner, alpha, beta, gamma, delta } = await businessWithLeads();
    expect(await idsFor(owner, [{ field: 'temperature', operator: 'is', value: 'hot' }])).toEqual([alpha]);
    expect(await idsFor(owner, [{ field: 'temperature', operator: 'is', value: 'unscored' }])).toEqual([delta]);
    expect(await idsFor(owner, [{ field: 'temperature', operator: 'is_not', value: 'hot' }])).toEqual(
      [beta, gamma, delta].sort(),
    );
  });

  it('filters a text field: contains (any capitals), is, is empty and is not empty', async () => {
    const { owner, alpha, beta, gamma, delta } = await businessWithLeads();
    expect(await idsFor(owner, [{ field: 'custom.note', operator: 'contains', value: 'GARDEN' }])).toEqual([alpha]);
    expect(await idsFor(owner, [{ field: 'custom.note', operator: 'is', value: 'hall only' }])).toEqual([beta]);
    expect(await idsFor(owner, [{ field: 'custom.note', operator: 'is_empty' }])).toEqual([gamma, delta].sort());
    expect(await idsFor(owner, [{ field: 'custom.note', operator: 'is_not_empty' }])).toEqual([alpha, beta].sort());
  });

  it('filters a number field: is, greater than, less than, and a lead without an answer matches neither side', async () => {
    const { owner, alpha, beta, gamma } = await businessWithLeads();
    expect(await idsFor(owner, [{ field: 'custom.guests', operator: 'greater_than', value: 100 }])).toEqual(
      [beta, gamma].sort(),
    );
    expect(await idsFor(owner, [{ field: 'custom.guests', operator: 'less_than', value: '100' }])).toEqual([alpha]);
    expect(await idsFor(owner, [{ field: 'custom.guests', operator: 'is', value: 120 }])).toEqual([gamma]);
  });

  it('filters a date field: before, after and is', async () => {
    const { owner, alpha, beta } = await businessWithLeads();
    expect(await idsFor(owner, [{ field: 'custom.wedding', operator: 'before', value: '2027-01-01' }])).toEqual([
      alpha,
    ]);
    expect(await idsFor(owner, [{ field: 'custom.wedding', operator: 'after', value: '2027-01-01' }])).toEqual([beta]);
    expect(await idsFor(owner, [{ field: 'custom.wedding', operator: 'is', value: '2027-02-01' }])).toEqual([beta]);
  });

  it('filters a dropdown and a yes/no field', async () => {
    const { owner, alpha, beta } = await businessWithLeads();
    expect(await idsFor(owner, [{ field: 'custom.car', operator: 'is', value: 'swift' }])).toEqual([alpha]);
    expect(await idsFor(owner, [{ field: 'custom.car', operator: 'is_not', value: 'Swift' }])).toContain(beta);
    expect(await idsFor(owner, [{ field: 'custom.vip', operator: 'is', value: 'yes' }])).toEqual([alpha]);
    expect(await idsFor(owner, [{ field: 'custom.vip', operator: 'is', value: false }])).toEqual([beta]);
  });

  it('needs every condition to hold, and works with the other filters, sorting, paging and the board', async () => {
    const { owner, beta, gamma } = await businessWithLeads();
    const both = [
      { field: 'custom.guests', operator: 'greater_than', value: 100 },
      { field: 'temperature', operator: 'is_not', value: 'hot' },
    ];
    expect(await idsFor(owner, both)).toEqual([beta, gamma].sort());
    expect(await idsFor(owner, both, '&status=open&sort=createdAt&order=asc')).toEqual([beta, gamma].sort());
    const page = await owner.ok('GET', `/leads?${filtersQuery(both)}&limit=1&page=2`);
    expect(page).toMatchObject({ total: 2, page: 2 });
    expect(page.items).toHaveLength(1);
    const board = await owner.ok(
      'GET',
      `/leads?view=board&${filtersQuery([{ field: 'temperature', operator: 'is', value: 'hot' }])}`,
    );
    const onBoard = board.columns.flatMap((column: { leads: Array<{ id: string }> }) =>
      column.leads.map((lead) => lead.id),
    );
    expect(onBoard).toHaveLength(1);
  });

  it('treats %, _ and quotes in a value as plain text and never as SQL', async () => {
    const { owner } = await businessWithLeads();
    expect(await idsFor(owner, [{ field: 'custom.note', operator: 'contains', value: '%' }])).toEqual([]);
    expect(
      await idsFor(owner, [{ field: 'custom.note', operator: 'contains', value: "'; drop table leads; --" }]),
    ).toEqual([]);
    expect((await owner.ok('GET', '/leads?limit=100')).total).toBe(4);
  });

  it('keeps the "own leads only" role to its own leads whatever the filter says', async () => {
    const { owner, alpha, beta } = await businessWithLeads();
    const colleague = await addTeamMember(app, database, owner, { name: 'Asha', role: 'staff_own' });
    const everything = [{ field: 'custom.guests', operator: 'is_not_empty' }];
    expect(await idsFor(colleague, everything)).toEqual([]);
    await owner.ok('POST', `/leads/${alpha}/assign`, { ownerUserId: colleague.userId });
    expect(await idsFor(colleague, everything)).toEqual([alpha]);
    expect(beta).toBeTruthy();
  });

  it('refuses what makes no sense (400 INVALID_FILTERS): unknown field, wrong operator, wrong value, bad JSON, extra words, too many', async () => {
    const { owner } = await businessWithLeads();
    const bad: unknown[] = [
      [{ field: 'custom.nope', operator: 'is', value: 'x' }],
      [{ field: 'custom.guests', operator: 'contains', value: '5' }],
      [{ field: 'custom.guests', operator: 'greater_than', value: 'many' }],
      [{ field: 'custom.wedding', operator: 'before', value: 'next week' }],
      [{ field: 'custom.car', operator: 'is', value: 'Tesla' }],
      [{ field: 'temperature', operator: 'is', value: 'boiling' }],
      [{ field: 'name', operator: 'is', value: 'x' }],
      [{ field: 'temperature', operator: 'is', value: 'hot', colour: 'red' }],
      { field: 'temperature' },
      Array.from({ length: 11 }, () => ({ field: 'temperature', operator: 'is', value: 'hot' })),
    ];
    for (const conditions of bad) {
      expect(
        await owner.refused('GET', `/leads?${filtersQuery(conditions)}`, undefined, 400),
        JSON.stringify(conditions),
      ).toBe('INVALID_FILTERS');
    }
    expect(await owner.refused('GET', '/leads?filters=not-json', undefined, 400)).toBe('INVALID_FILTERS');
    await owner.refused('GET', `/leads?filters=${'x'.repeat(4001)}`, undefined, 400);
  });

  it('ignores a field that was removed (it can no longer be filtered), and empty filters change nothing', async () => {
    const { owner } = await businessWithLeads();
    const fields = (await owner.ok('GET', '/fields?object=lead')).items as Array<{ id: string; key: string }>;
    await owner.ok('DELETE', `/fields/${fields.find((field) => field.key === 'guests')!.id}`, undefined, 204);
    await owner.refused(
      'GET',
      `/leads?${filtersQuery([{ field: 'custom.guests', operator: 'is_not_empty' }])}`,
      undefined,
      400,
    );
    expect((await owner.ok('GET', `/leads?${filtersQuery([])}`)).total).toBe(4);
  });
});
