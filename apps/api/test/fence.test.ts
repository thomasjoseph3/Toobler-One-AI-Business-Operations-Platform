import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/db';
import { uuidv7 } from '../src/kernel/ids';
import { newAccountId, openTestDatabase } from './support/harness';

// The probe table stands in for every business table: if the fence keeps businesses apart here, the same policy
// (app.enable_tenant_rls) keeps them apart everywhere.
let database: Database;
const accountIdOfBusinessA = newAccountId();
const accountIdOfBusinessB = newAccountId();

beforeAll(async () => {
  database = openTestDatabase();
  await sql`create table if not exists app.fence_probe (id uuid primary key, account_id uuid not null, note text)`.execute(
    database.system,
  );
  await sql`select app.enable_tenant_rls('app.fence_probe')`.execute(database.system).catch(() => {}); // already done on a re-run
  await sql`delete from app.fence_probe`.execute(database.system);
  const insertNoteFor = (accountId: string, note: string) =>
    sql`insert into app.fence_probe (id, account_id, note) values (${uuidv7()}, ${accountId}, ${note})`;
  await insertNoteFor(accountIdOfBusinessA, 'a-secret').execute(database.system);
  await insertNoteFor(accountIdOfBusinessB, 'b-secret').execute(database.system);
});

afterAll(async () => {
  await sql`drop table if exists app.fence_probe`.execute(database.system);
  await database.close();
});

// Reads every note the given connection is allowed to see.
const readVisibleNotes = (connection: Database['system']) =>
  sql<{ note: string }>`select note from app.fence_probe order by note`
    .execute(connection)
    .then((result) => result.rows.map((row) => row.note));

describe('the account fence', () => {
  it('shows a business only its own rows', async () => {
    expect(await database.runInAccountTransaction(accountIdOfBusinessA, readVisibleNotes)).toEqual(['a-secret']);
    expect(await database.runInAccountTransaction(accountIdOfBusinessB, readVisibleNotes)).toEqual(['b-secret']);
  });

  it('shows nothing when no business is set, even to a query that forgot its WHERE', async () => {
    const visibleNotes = await database.runInSystemTransaction(async (transaction) => {
      await sql`set local role app_user`.execute(transaction); // fenced role, but no account set
      return readVisibleNotes(transaction);
    });
    expect(visibleNotes).toEqual([]);
  });

  it('refuses to write a row for another business', async () => {
    await expect(
      database.runInAccountTransaction(accountIdOfBusinessA, (transaction) =>
        sql`insert into app.fence_probe (id, account_id, note) values (${uuidv7()}, ${accountIdOfBusinessB}, 'planted')`.execute(
          transaction,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot change or delete another business's rows", async () => {
    const updateResult = await database.runInAccountTransaction(accountIdOfBusinessA, (transaction) =>
      sql`update app.fence_probe set note = 'hacked' where account_id = ${accountIdOfBusinessB}`.execute(transaction),
    );
    const deleteResult = await database.runInAccountTransaction(accountIdOfBusinessA, (transaction) =>
      sql`delete from app.fence_probe where account_id = ${accountIdOfBusinessB}`.execute(transaction),
    );
    expect(updateResult.numAffectedRows).toBe(0n);
    expect(deleteResult.numAffectedRows).toBe(0n);
    expect(await database.runInAccountTransaction(accountIdOfBusinessB, readVisibleNotes)).toEqual(['b-secret']);
  });

  it('does not leak the account or the role to the next transaction on the same connection', async () => {
    await database.runInAccountTransaction(accountIdOfBusinessA, readVisibleNotes);
    const [connectionStateAfterwards] = await database.runInSystemTransaction((transaction) =>
      sql<{
        account: string | null;
        role: string;
      }>`select current_setting('app.account_id', true) as account, current_user as role`
        .execute(transaction)
        .then((result) => result.rows),
    );
    expect(connectionStateAfterwards?.account || null).toBeNull();
    expect(connectionStateAfterwards?.role).not.toBe('app_user');
  });

  it('rejects an account id that is not a UUID before touching the database', () => {
    expect(() => database.runInAccountTransaction("x'; drop table app.fence_probe; --", async () => 1)).toThrow(
      /account id/,
    );
  });

  it('has roles set up the way the fence needs', async () => {
    await expect(database.verifyRoles()).resolves.toBeUndefined();
  });
});
