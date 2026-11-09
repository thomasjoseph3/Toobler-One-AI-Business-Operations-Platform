import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/db';
import { uuidv7 } from '../src/kernel/ids';
import { newAccountId, openTestDatabase } from './support/harness';

// The probe table stands in for every business table: if the fence keeps businesses apart here, the same policy
// (app.enable_tenant_rls) keeps them apart everywhere.
let database: Database;
const A = newAccountId();
const B = newAccountId();

beforeAll(async () => {
  database = openTestDatabase();
  await sql`create table if not exists app.fence_probe (id uuid primary key, account_id uuid not null, note text)`.execute(database.system);
  await sql`select app.enable_tenant_rls('app.fence_probe')`.execute(database.system).catch(() => {}); // already done on a re-run
  await sql`delete from app.fence_probe`.execute(database.system);
  const insert = (account: string, note: string) =>
    sql`insert into app.fence_probe (id, account_id, note) values (${uuidv7()}, ${account}, ${note})`;
  await insert(A, 'a-secret').execute(database.system);
  await insert(B, 'b-secret').execute(database.system);
});

afterAll(async () => {
  await sql`drop table if exists app.fence_probe`.execute(database.system);
  await database.close();
});

const notes = (db: Database['system']) => sql<{ note: string }>`select note from app.fence_probe order by note`.execute(db).then((r) => r.rows.map((x) => x.note));

describe('the account fence', () => {
  it('shows a business only its own rows', async () => {
    expect(await database.tx(A, notes)).toEqual(['a-secret']);
    expect(await database.tx(B, notes)).toEqual(['b-secret']);
  });

  it('shows nothing when no business is set, even to a query that forgot its WHERE', async () => {
    const rows = await database.systemTx(async (trx) => {
      await sql`set local role app_user`.execute(trx); // fenced role, but no account set
      return notes(trx);
    });
    expect(rows).toEqual([]);
  });

  it('refuses to write a row for another business', async () => {
    await expect(
      database.tx(A, (trx) => sql`insert into app.fence_probe (id, account_id, note) values (${uuidv7()}, ${B}, 'planted')`.execute(trx)),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot change or delete another business's rows", async () => {
    const updated = await database.tx(A, (trx) => sql`update app.fence_probe set note = 'hacked' where account_id = ${B}`.execute(trx));
    const deleted = await database.tx(A, (trx) => sql`delete from app.fence_probe where account_id = ${B}`.execute(trx));
    expect(updated.numAffectedRows).toBe(0n);
    expect(deleted.numAffectedRows).toBe(0n);
    expect(await database.tx(B, notes)).toEqual(['b-secret']);
  });

  it('does not leak the account or the role to the next transaction on the same connection', async () => {
    await database.tx(A, notes);
    const [after] = await database.systemTx((trx) =>
      sql<{ account: string | null; role: string }>`select current_setting('app.account_id', true) as account, current_user as role`
        .execute(trx)
        .then((r) => r.rows),
    );
    expect(after?.account || null).toBeNull();
    expect(after?.role).not.toBe('app_user');
  });

  it('rejects an account id that is not a UUID before touching the database', () => {
    expect(() => database.tx("x'; drop table app.fence_probe; --", async () => 1)).toThrow(/account id/);
  });

  it('has roles set up the way the fence needs', async () => {
    await expect(database.verifyRoles()).resolves.toBeUndefined();
  });
});
