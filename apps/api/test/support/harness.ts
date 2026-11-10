import { createDatabase, type Database } from '../../src/kernel/db';
import { uuidv7 } from '../../src/kernel/ids';
import { testDatabaseConfig } from './database';

/** A database handle on the throwaway test database. Close it in afterAll. */
export const openTestDatabase = (): Database => createDatabase(testDatabaseConfig());

/** A new business id: tests never share one, so they never see each other's rows. */
export const newAccountId = () => uuidv7();

/** Waits (checking every 20 ms) until `condition` is true; fails the test after `timeoutMilliseconds`. */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Gave up waiting for the condition to become true');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
