import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { addTeamMember, signUpOwner } from './support/team';

// F09 slices 1 and 2: adding, listing, changing, removing and reordering custom fields. Whole stories by real people, plus the usual refusals and the fence between businesses.

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

describe('POST /api/v1/fields', () => {
  it('adds a dropdown field, making its key from the label and tidying its choices', async () => {
    const owner = await signUpOwner(app, database);
    const field = await owner.ok(
      'POST',
      '/fields',
      {
        object: 'lead',
        label: ' Car model ',
        type: 'dropdown',
        options: [' Swift ', 'Baleno', 'swift', '', 'Brezza'],
        aiAsks: true,
        requiredForWon: true,
      },
      201,
    );
    expect(field).toMatchObject({
      object: 'lead',
      key: 'car_model',
      label: 'Car model',
      type: 'dropdown',
      options: ['Swift', 'Baleno', 'Brezza'],
      aiAsks: true,
      requiredForWon: true,
    });
    expect(field.id).toBeTruthy();
  });

  it('adds a field of every other type, with the two switches off unless asked', async () => {
    const owner = await signUpOwner(app, database);
    for (const type of ['text', 'number', 'date', 'yes_no', 'phone', 'email']) {
      const field = await owner.ok('POST', '/fields', { object: 'contact', label: `A ${type}`, type }, 201);
      expect(field).toMatchObject({ type, options: [], aiAsks: false, requiredForWon: false });
    }
    expect((await owner.ok('GET', '/fields?object=contact')).items).toHaveLength(6);
  });

  it('gives a second field with the same label its own key, and never reuses a key', async () => {
    const owner = await signUpOwner(app, database);
    const first = await owner.ok('POST', '/fields', { object: 'lead', label: 'Car model', type: 'text' }, 201);
    const second = await owner.ok('POST', '/fields', { object: 'lead', label: 'Car model', type: 'text' }, 201);
    expect([first.key, second.key]).toEqual(['car_model', 'car_model_2']);
    // The same label on another object is its own field
    const onContact = await owner.ok('POST', '/fields', { object: 'contact', label: 'Car model', type: 'text' }, 201);
    expect(onContact.key).toBe('car_model');
    // A removed field keeps its key taken
    await database.system
      .updateTable('field_definitions')
      .set({ archived_at: new Date() })
      .where('id', '=', first.id)
      .execute();
    const third = await owner.ok('POST', '/fields', { object: 'lead', label: 'Car model', type: 'text' }, 201);
    expect(third.key).toBe('car_model_3');
  });

  it('puts a new field last, and lists the fields in that order', async () => {
    const owner = await signUpOwner(app, database);
    for (const label of ['Alpha', 'Beta', 'Gamma'])
      await owner.ok('POST', '/fields', { object: 'lead', label, type: 'text' }, 201);
    expect((await owner.ok('GET', '/fields?object=lead')).items.map((field: { label: string }) => field.label)).toEqual(
      ['Alpha', 'Beta', 'Gamma'],
    );
  });

  it('allows at most 50 live fields on an object (409), and a removed one frees a place', async () => {
    const owner = await signUpOwner(app, database);
    for (let index = 0; index < 50; index += 1) {
      await database.system
        .insertInto('field_definitions')
        .values({
          id: crypto.randomUUID(),
          account_id: owner.businessId,
          object: 'company',
          key: `field_${index}`,
          label: `Field ${index}`,
          type: 'text',
          options: '[]',
          sort: index,
        })
        .execute();
    }
    expect(
      await owner.refused('POST', '/fields', { object: 'company', label: 'One too many', type: 'text' }, 409),
    ).toBe('FIELD_LIMIT');
    // Another object is not affected
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Fine', type: 'text' }, 201);
    await database.system
      .updateTable('field_definitions')
      .set({ archived_at: new Date() })
      .where('account_id', '=', owner.businessId)
      .where('key', '=', 'field_0')
      .execute();
    await owner.ok('POST', '/fields', { object: 'company', label: 'Now it fits', type: 'text' }, 201);
  });

  it('refuses a bad request (400): no label, a bad type, a dropdown without choices, choices on a text field, required before Won off a lead, an unknown field', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('POST', '/fields', { object: 'lead', type: 'text' }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: '   ', type: 'text' }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: 'A', type: 'picture' }, 400);
    await owner.refused('POST', '/fields', { object: 'deal', label: 'A', type: 'text' }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: 'A', type: 'dropdown' }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: 'A', type: 'dropdown', options: ['', ' '] }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: 'A', type: 'text', options: ['x'] }, 400);
    await owner.refused('POST', '/fields', { object: 'contact', label: 'A', type: 'text', requiredForWon: true }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: 'A', type: 'text', key: 'sneaky' }, 400);
    await owner.refused('POST', '/fields', { object: 'lead', label: 'x'.repeat(81), type: 'text' }, 400);
    expect((await owner.ok('GET', '/fields')).items).toEqual([]);
  });

  it('is for managers only (403) and needs a sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    await staff.refused('POST', '/fields', { object: 'lead', label: 'A', type: 'text' }, 403);
    const nobody = await app.inject({
      method: 'POST',
      url: '/api/v1/fields',
      headers: unsafeRequestHeaders,
      payload: { object: 'lead', label: 'A', type: 'text' },
    });
    expect(nobody.statusCode).toBe(401);
  });

  it('writes the activity log with no words', async () => {
    const owner = await signUpOwner(app, database);
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Secret Label Words', type: 'text' }, 201);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'fields.created')
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(line)).not.toContain('Secret Label Words');
  });
});

describe('GET /api/v1/fields', () => {
  it('lists the business’s fields, one object’s or all, for managers and staff alike, and never another business’s', async () => {
    const owner = await signUpOwner(app, database);
    const staffOwn = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff_own' });
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Car model', type: 'text' }, 201);
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Birthday', type: 'date' }, 201);
    const stranger = await signUpOwner(app, database);
    await stranger.ok('POST', '/fields', { object: 'lead', label: 'Strangers only', type: 'text' }, 201);

    for (const person of [owner, staffOwn]) {
      expect((await person.ok('GET', '/fields')).items.map((field: { label: string }) => field.label)).toEqual([
        'Birthday',
        'Car model',
      ]);
      expect(
        (await person.ok('GET', '/fields?object=lead')).items.map((field: { label: string }) => field.label),
      ).toEqual(['Car model']);
    }
    expect((await owner.ok('GET', '/fields?object=company')).items).toEqual([]);
  });

  it('leaves out removed fields', async () => {
    const owner = await signUpOwner(app, database);
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'Old', type: 'text' }, 201);
    await database.system
      .updateTable('field_definitions')
      .set({ archived_at: new Date() })
      .where('id', '=', field.id)
      .execute();
    expect((await owner.ok('GET', '/fields')).items).toEqual([]);
  });

  it('refuses an unknown object (400) and needs a sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('GET', '/fields?object=deal', undefined, 400);
    const nobody = await app.inject({ method: 'GET', url: '/api/v1/fields' });
    expect(nobody.statusCode).toBe(401);
  });
});

describe('PATCH /api/v1/fields/{id}', () => {
  it('changes the name, choices and switches, keeping the key and type', async () => {
    const owner = await signUpOwner(app, database);
    const field = await owner.ok(
      'POST',
      '/fields',
      { object: 'lead', label: 'Car model', type: 'dropdown', options: ['Swift'] },
      201,
    );
    const changed = await owner.ok(
      'PATCH',
      `/fields/${field.id}`,
      { label: ' Vehicle ', options: ['Swift', ' Baleno ', 'swift'], aiAsks: true, requiredForWon: true },
      200,
    );
    expect(changed).toMatchObject({
      id: field.id,
      key: 'car_model',
      type: 'dropdown',
      label: 'Vehicle',
      options: ['Swift', 'Baleno'],
      aiAsks: true,
      requiredForWon: true,
    });
    // Only what is sent changes
    const again = await owner.ok('PATCH', `/fields/${field.id}`, { aiAsks: false }, 200);
    expect(again).toMatchObject({
      label: 'Vehicle',
      options: ['Swift', 'Baleno'],
      aiAsks: false,
      requiredForWon: true,
    });
  });

  it('refuses a bad change (400): nothing sent, key or type, choices on a non-dropdown, no choices left, required before Won off a lead', async () => {
    const owner = await signUpOwner(app, database);
    const dropdown = await owner.ok(
      'POST',
      '/fields',
      { object: 'lead', label: 'Pick', type: 'dropdown', options: ['A'] },
      201,
    );
    const text = await owner.ok('POST', '/fields', { object: 'contact', label: 'Note', type: 'text' }, 201);
    await owner.refused('PATCH', `/fields/${dropdown.id}`, {}, 400);
    await owner.refused('PATCH', `/fields/${dropdown.id}`, { key: 'sneaky' }, 400);
    await owner.refused('PATCH', `/fields/${dropdown.id}`, { type: 'text' }, 400);
    await owner.refused('PATCH', `/fields/${dropdown.id}`, { object: 'contact' }, 400);
    await owner.refused('PATCH', `/fields/${dropdown.id}`, { label: '  ' }, 400);
    await owner.refused('PATCH', `/fields/${dropdown.id}`, { options: [' ', ''] }, 400);
    await owner.refused(
      'PATCH',
      `/fields/${dropdown.id}`,
      { options: Array.from({ length: 31 }, (_, index) => `C${index}`) },
      400,
    );
    await owner.refused('PATCH', `/fields/${text.id}`, { options: ['x'] }, 400);
    await owner.refused('PATCH', `/fields/${text.id}`, { requiredForWon: true }, 400);
    await owner.refused('PATCH', '/fields/not-an-id', { label: 'A' }, 400);
    expect((await owner.ok('GET', '/fields?object=lead')).items[0]).toMatchObject({ label: 'Pick', options: ['A'] });
  });

  it('is 404 for an unknown, removed or another business’s field, and for managers only (403, 401)', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const stranger = await signUpOwner(app, database);
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'Mine', type: 'text' }, 201);
    await stranger.refused('PATCH', `/fields/${field.id}`, { label: 'Hacked' }, 404);
    await owner.refused('PATCH', `/fields/${crypto.randomUUID()}`, { label: 'A' }, 404);
    await staff.refused('PATCH', `/fields/${field.id}`, { label: 'A' }, 403);
    const nobody = await app.inject({
      method: 'PATCH',
      url: `/api/v1/fields/${field.id}`,
      headers: unsafeRequestHeaders,
      payload: { label: 'A' },
    });
    expect(nobody.statusCode).toBe(401);
    await owner.ok('DELETE', `/fields/${field.id}`, undefined, 204);
    await owner.refused('PATCH', `/fields/${field.id}`, { label: 'A' }, 404);
    expect((await stranger.ok('GET', '/fields')).items).toEqual([]);
  });

  it('writes the activity log with no words', async () => {
    const owner = await signUpOwner(app, database);
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'Plain', type: 'text' }, 201);
    await owner.ok('PATCH', `/fields/${field.id}`, { label: 'Renamed Secret Words' }, 200);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'fields.updated')
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(line)).not.toContain('Renamed Secret Words');
  });
});

describe('DELETE /api/v1/fields/{id}', () => {
  it('archives the field: it leaves the list, its row and key stay, and its place is freed', async () => {
    const owner = await signUpOwner(app, database);
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'Old', type: 'text' }, 201);
    await owner.ok('DELETE', `/fields/${field.id}`, undefined, 204);
    expect((await owner.ok('GET', '/fields')).items).toEqual([]);
    const row = await database.system
      .selectFrom('field_definitions')
      .select(['key', 'archived_at'])
      .where('id', '=', field.id)
      .executeTakeFirstOrThrow();
    expect(row.key).toBe('old');
    expect(row.archived_at).not.toBeNull();
    // The key stays taken
    const next = await owner.ok('POST', '/fields', { object: 'lead', label: 'Old', type: 'text' }, 201);
    expect(next.key).toBe('old_2');
    await owner.refused('DELETE', `/fields/${field.id}`, undefined, 404);
  });

  it('is 404 for an unknown or another business’s field (left untouched), 403 for staff, 401 signed out, 400 for a bad id', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const stranger = await signUpOwner(app, database);
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'Mine', type: 'text' }, 201);
    await stranger.refused('DELETE', `/fields/${field.id}`, undefined, 404);
    await owner.refused('DELETE', `/fields/${crypto.randomUUID()}`, undefined, 404);
    await staff.refused('DELETE', `/fields/${field.id}`, undefined, 403);
    await owner.refused('DELETE', '/fields/not-an-id', undefined, 400);
    const nobody = await app.inject({
      method: 'DELETE',
      url: `/api/v1/fields/${field.id}`,
      headers: unsafeRequestHeaders,
    });
    expect(nobody.statusCode).toBe(401);
    expect((await owner.ok('GET', '/fields')).items).toHaveLength(1);
  });

  it('writes the activity log with no words', async () => {
    const owner = await signUpOwner(app, database);
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'Gone Secret Words', type: 'text' }, 201);
    await owner.ok('DELETE', `/fields/${field.id}`, undefined, 204);
    const line = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'fields.deleted')
      .executeTakeFirstOrThrow();
    expect(JSON.stringify(line)).not.toContain('Secret Words');
  });
});

describe('POST /api/v1/fields/reorder', () => {
  it('puts an object’s fields in the order sent, and leaves other objects alone', async () => {
    const owner = await signUpOwner(app, database);
    const alpha = await owner.ok('POST', '/fields', { object: 'lead', label: 'Alpha', type: 'text' }, 201);
    const beta = await owner.ok('POST', '/fields', { object: 'lead', label: 'Beta', type: 'text' }, 201);
    const gamma = await owner.ok('POST', '/fields', { object: 'lead', label: 'Gamma', type: 'text' }, 201);
    await owner.ok('POST', '/fields', { object: 'contact', label: 'Delta', type: 'text' }, 201);
    const answer = await owner.ok(
      'POST',
      '/fields/reorder',
      { object: 'lead', ids: [gamma.id, alpha.id, beta.id] },
      200,
    );
    expect(answer.items.map((field: { label: string }) => field.label)).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect((await owner.ok('GET', '/fields?object=lead')).items.map((field: { label: string }) => field.label)).toEqual(
      ['Gamma', 'Alpha', 'Beta'],
    );
    expect((await owner.ok('GET', '/fields?object=contact')).items).toHaveLength(1);
    // A field added afterwards goes last
    await owner.ok('POST', '/fields', { object: 'lead', label: 'Omega', type: 'text' }, 201);
    expect((await owner.ok('GET', '/fields?object=lead')).items.at(-1).label).toBe('Omega');
  });

  it('refuses ids that are not exactly the live fields (409), another business’s ids included', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const first = await owner.ok('POST', '/fields', { object: 'lead', label: 'One', type: 'text' }, 201);
    const second = await owner.ok('POST', '/fields', { object: 'lead', label: 'Two', type: 'text' }, 201);
    const strangersField = await stranger.ok('POST', '/fields', { object: 'lead', label: 'Theirs', type: 'text' }, 201);
    expect(await owner.refused('POST', '/fields/reorder', { object: 'lead', ids: [first.id] }, 409)).toBe(
      'FIELDS_CHANGED',
    );
    await owner.refused('POST', '/fields/reorder', { object: 'lead', ids: [first.id, first.id] }, 409);
    await owner.refused('POST', '/fields/reorder', { object: 'lead', ids: [first.id, strangersField.id] }, 409);
    await owner.refused('POST', '/fields/reorder', { object: 'contact', ids: [first.id, second.id] }, 409);
    expect((await stranger.ok('GET', '/fields')).items).toHaveLength(1);
  });

  it('refuses a bad request (400), staff (403) and no sign-in (401)', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Rahul Das', role: 'staff' });
    const field = await owner.ok('POST', '/fields', { object: 'lead', label: 'One', type: 'text' }, 201);
    await owner.refused('POST', '/fields/reorder', { object: 'lead', ids: [] }, 400);
    await owner.refused('POST', '/fields/reorder', { object: 'lead', ids: ['nope'] }, 400);
    await owner.refused('POST', '/fields/reorder', { ids: [field.id] }, 400);
    await owner.refused('POST', '/fields/reorder', { object: 'lead', ids: [field.id], extra: 1 }, 400);
    await staff.refused('POST', '/fields/reorder', { object: 'lead', ids: [field.id] }, 403);
    const nobody = await app.inject({
      method: 'POST',
      url: '/api/v1/fields/reorder',
      headers: unsafeRequestHeaders,
      payload: { object: 'lead', ids: [field.id] },
    });
    expect(nobody.statusCode).toBe(401);
  });
});
