import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { openTestDatabase } from './support/harness';
import { signUpOwner } from './support/team';

// F11 slice 4b: the filter engine on the Contacts and Companies lists (`GET /contacts?filters=` and `GET /companies?filters=`).

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

const filtersQuery = (conditions: unknown) => `filters=${encodeURIComponent(JSON.stringify(conditions))}`;

describe('GET /contacts?filters=', () => {
  async function businessWithContacts() {
    const owner = await signUpOwner(app, database);
    await owner.ok(
      'POST',
      '/fields',
      { object: 'contact', label: 'Car', type: 'dropdown', options: ['Swift', 'Baleno'] },
      201,
    );
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Birthday', type: 'date' }, 201);
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Guests', type: 'number' }, 201);
    const make = async (name: string, phone: string, custom: Record<string, unknown>) =>
      (await owner.ok('POST', '/contacts', { name, phone, custom }, 201)).id as string;
    const priya = await make('Priya', '+919847000001', { car: 'Swift', birthday: '1990-05-04', guests: 10 });
    const rahul = await make('Rahul', '+919847000002', { car: 'Baleno', birthday: '1985-01-01', guests: 300 });
    const meera = await make('Meera', '+919847000003', {});
    return { owner, priya, rahul, meera };
  }
  const ids = async (owner: Awaited<ReturnType<typeof signUpOwner>>, query: string) =>
    ((await owner.ok('GET', `/contacts?${query}&limit=100`)).items as Array<{ id: string }>)
      .map((contact) => contact.id)
      .sort();

  it('filters on the business’s own contact fields and combines with search and the lifecycle stage', async () => {
    const { owner, priya, rahul, meera } = await businessWithContacts();
    expect(await ids(owner, filtersQuery([{ field: 'custom.car', operator: 'is', value: 'swift' }]))).toEqual([priya]);
    expect(
      await ids(owner, filtersQuery([{ field: 'custom.birthday', operator: 'before', value: '1988-01-01' }])),
    ).toEqual([rahul]);
    expect(await ids(owner, filtersQuery([{ field: 'custom.guests', operator: 'greater_than', value: 5 }]))).toEqual(
      [priya, rahul].sort(),
    );
    expect(await ids(owner, filtersQuery([{ field: 'custom.car', operator: 'is_empty' }]))).toEqual([meera]);
    expect(
      await ids(owner, `${filtersQuery([{ field: 'custom.guests', operator: 'greater_than', value: 5 }])}&q=rahul`),
    ).toEqual([rahul]);
    const counted = await owner.ok(
      'GET',
      `/contacts?${filtersQuery([{ field: 'custom.car', operator: 'is_not_empty' }])}&limit=1`,
    );
    expect(counted).toMatchObject({ total: 2, limit: 1 });
  });

  it('refuses what makes no sense (400 INVALID_FILTERS), including a field that belongs to another list', async () => {
    const { owner } = await businessWithContacts();
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Only on leads', type: 'text' }, 201);
    for (const conditions of [
      [{ field: 'custom.only_on_leads', operator: 'is', value: 'x' }],
      [{ field: 'custom.car', operator: 'contains', value: 'a' }],
      [{ field: 'custom.guests', operator: 'is', value: 'lots' }],
      [{ field: 'temperature', operator: 'is', value: 'hot' }],
    ]) {
      expect(await owner.refused('GET', `/contacts?${filtersQuery(conditions)}`, undefined, 400)).toBe(
        'INVALID_FILTERS',
      );
    }
    expect(await owner.refused('GET', '/contacts?filters=oops', undefined, 400)).toBe('INVALID_FILTERS');
  });

  it('never matches another business’s contacts', async () => {
    const { owner } = await businessWithContacts();
    expect(await ids(owner, filtersQuery([{ field: 'custom.car', operator: 'is_not_empty' }]))).toHaveLength(2);
    const other = await signUpOwner(app, database);
    expect(await ids(other, filtersQuery([]))).toEqual([]);
  });
});

describe('GET /companies?filters=', () => {
  it('filters on the business’s own company fields and combines with search', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok(
      'POST',
      '/fields',
      { object: 'company', label: 'Size', type: 'dropdown', options: ['Small', 'Large'] },
      201,
    );
    await owner.ok('POST', '/fields', { object: 'company', label: 'Staff', type: 'number' }, 201);
    const acme = (
      await owner.ok('POST', '/companies', { name: 'Acme Weddings', custom: { size: 'Large', staff: 80 } }, 201)
    ).id;
    const tiny = (await owner.ok('POST', '/companies', { name: 'Tiny Acme', custom: { size: 'Small', staff: 3 } }, 201))
      .id;
    const idsOf = async (query: string) =>
      ((await owner.ok('GET', `/companies?${query}`)).items as Array<{ id: string }>)
        .map((company) => company.id)
        .sort();
    expect(await idsOf(filtersQuery([{ field: 'custom.size', operator: 'is', value: 'large' }]))).toEqual([acme]);
    expect(await idsOf(filtersQuery([{ field: 'custom.staff', operator: 'less_than', value: 10 }]))).toEqual([tiny]);
    expect(await idsOf(`${filtersQuery([{ field: 'custom.staff', operator: 'is_not_empty' }])}&q=tiny`)).toEqual([
      tiny,
    ]);
    expect(
      await owner.refused(
        'GET',
        `/companies?${filtersQuery([{ field: 'custom.nope', operator: 'is', value: 'x' }])}`,
        undefined,
        400,
      ),
    ).toBe('INVALID_FILTERS');
  });
});
