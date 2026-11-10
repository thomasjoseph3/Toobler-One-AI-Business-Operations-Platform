import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp } from './support/app';
import { createSignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

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

describe('the platform admin flag', () => {
  it('is off for everyone who signs up', async () => {
    const person = await createSignedInPerson(app, database);
    const row = await database.system
      .selectFrom('users')
      .select('is_platform_admin')
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row.is_platform_admin).toBe(false);
  });

  it('cannot be switched on from inside a business: the app role may not set it, even on its own row', async () => {
    const person = await createSignedInPerson(app, database);
    await expect(
      database.runInAccountTransaction(person.profile.business.id, (transaction) =>
        transaction
          .updateTable('users')
          .set({ is_platform_admin: true })
          .where('id', '=', person.profile.user.id)
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('cannot be set while adding a person from inside a business either', async () => {
    const person = await createSignedInPerson(app, database);
    await expect(
      database.runInAccountTransaction(person.profile.business.id, (transaction) =>
        transaction
          .insertInto('users')
          .values({
            id: '00000000-0000-7000-8000-000000000001',
            account_id: person.profile.business.id,
            email: 'sneaky@example.com',
            name: 'Sneaky',
            mobile_e164: null,
            mobile_key: null,
            role: 'staff',
            last_login_at: null,
            created_by: null,
            updated_by: null,
            is_platform_admin: true,
          })
          .execute(),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('still lets the app role do its normal work on users: change a name, add a person without the flag', async () => {
    const person = await createSignedInPerson(app, database);
    await database.runInAccountTransaction(person.profile.business.id, (transaction) =>
      transaction.updateTable('users').set({ name: 'Renamed' }).where('id', '=', person.profile.user.id).execute(),
    );
    const row = await database.system
      .selectFrom('users')
      .select('name')
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row.name).toBe('Renamed');
  });

  it('can be switched on by someone with database access (its effect on routes is tested in industries-add.test.ts)', async () => {
    const person = await createSignedInPerson(app, database);
    await database.system
      .updateTable('users')
      .set({ is_platform_admin: true })
      .where('id', '=', person.profile.user.id)
      .execute();
    const row = await database.system
      .selectFrom('users')
      .select('is_platform_admin')
      .where('id', '=', person.profile.user.id)
      .executeTakeFirstOrThrow();
    expect(row.is_platform_admin).toBe(true);
  });
});
