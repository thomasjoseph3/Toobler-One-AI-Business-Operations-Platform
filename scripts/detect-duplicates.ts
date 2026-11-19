// npm run duplicates:detect -- --email manager@example.com [--allow-remote]
//
// Runs the nightly duplicate search NOW for ONE business (the one the email's person works in), so you can try Contacts → Possible duplicates
// without waiting for 02:30. It is the same code the nightly job runs: safe to run twice, and a pair someone said is "Not the same" never comes back.
//
// It WRITES suggestion rows to the database that DATABASE_URL points to. A database that is not on this computer needs --allow-remote, which you add
// on purpose. It prints only how many new pairs were found, never a name, phone or email.
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createContextFactory } from '../apps/api/src/kernel/context';
import { createDatabase } from '../apps/api/src/kernel/database';
import { detectDuplicatesForBusiness } from '../apps/api/src/modules/core/duplicates';

loadEnvFile();
process.env.LOG_LEVEL = 'warn';
const config = loadConfig();
const databaseAddress = new URL(config.db.url);
const isLocalDatabase = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(databaseAddress.hostname);
const emailPosition = process.argv.indexOf('--email');
const email = emailPosition === -1 ? undefined : process.argv[emailPosition + 1]?.trim().toLowerCase();

console.log(`Database: ${databaseAddress.hostname}${databaseAddress.pathname}`);
if (!email) {
  console.log('Usage: npm run duplicates:detect -- --email <a person of the business>');
  process.exit(1);
}
if (!isLocalDatabase && !process.argv.includes('--allow-remote')) {
  console.log('This database is not on this computer, so nothing was done.');
  console.log('If you are sure it is your development database, run again with --allow-remote added.');
  process.exit(1);
}

const database = createDatabase(config.db);
try {
  await database.ping();
  const person = await database.pool.query<{ account_id: string; business_name: string }>(
    `select u.account_id, a.name as business_name from app.users u join app.accounts a on a.id = u.account_id where u.email = $1`,
    [email],
  );
  const business = person.rows[0];
  if (!business) {
    console.log('No person with that email was found.');
    process.exit(1);
  }
  console.log(`Business: ${business.business_name}`);
  const newPairs = await detectDuplicatesForBusiness(
    createContextFactory(database)(business.account_id, { kind: 'system', id: 'duplicates.detect' }),
  );
  console.log(`Done. ${newPairs} new possible duplicate${newPairs === 1 ? '' : 's'} found.`);
} finally {
  await database.close();
}
