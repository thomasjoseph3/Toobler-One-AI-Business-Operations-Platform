import { createDatabase, type Database } from '../../src/kernel/db';
import { uuidv7 } from '../../src/kernel/ids';
import { testDatabaseConfig } from './database';

/** A database handle on the throwaway test database. Close it in afterAll. */
export const openTestDatabase = (): Database => createDatabase(testDatabaseConfig());

/** A new business id: tests never share one, so they never see each other's rows. */
export const newAccountId = () => uuidv7();
