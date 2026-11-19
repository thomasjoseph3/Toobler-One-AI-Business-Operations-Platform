// npm run platform-admin -- list
// npm run platform-admin -- grant someone@example.com
// npm run platform-admin -- revoke someone@example.com
//
// Makes a person a platform admin (the Toobler team: they can lend the platform's AI keys, edit the AI model list, add industries and
// put modules in plans) or takes it away. It changes the database that DATABASE_URL points to (your development database), so it
// only runs when you type it. Nobody can do this from inside the app: that is on purpose. The person must already have signed up and
// verified their email; the change takes effect on their next request (no new sign-in needed).
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createPool } from '../apps/api/src/kernel/database';
import { listPlatformAdmins, setPlatformAdmin } from './platform-admin-core';

loadEnvFile();
const [command, emailArgument] = process.argv.slice(2);
const databaseConfig = loadConfig().db;
const databaseAddress = new URL(databaseConfig.url);
const pool = createPool(databaseConfig);

try {
  console.log(`Database: ${databaseAddress.hostname}${databaseAddress.pathname}`);
  if (command === 'list') {
    const admins = await listPlatformAdmins(pool);
    console.log(
      admins.length === 0
        ? 'No platform admins yet.'
        : `${admins.length} platform admin${admins.length === 1 ? '' : 's'}:`,
    );
    for (const admin of admins) console.log(`  ${admin.email} (${admin.name}, ${admin.businessName})`);
  } else if ((command === 'grant' || command === 'revoke') && emailArgument) {
    const change = await setPlatformAdmin(pool, emailArgument, command === 'grant');
    if (change.outcome === 'changed') {
      console.log(
        change.isPlatformAdmin
          ? `${change.email} is now a platform admin.`
          : `${change.email} is no longer a platform admin.`,
      );
    } else if (change.outcome === 'already') {
      console.log(
        `${change.email} ${change.isPlatformAdmin ? 'already is' : 'already is not'} a platform admin. Nothing changed.`,
      );
    } else if (change.outcome === 'not_found') {
      console.log(`No one has signed up with ${change.email}. They must sign up first.`);
      process.exitCode = 1;
    } else {
      console.log(`Not changed: ${change.reason}.`);
      process.exitCode = 1;
    }
  } else {
    console.log('Use: npm run platform-admin -- list | grant <email> | revoke <email>');
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
