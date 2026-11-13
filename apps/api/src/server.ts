import { buildApp } from './app';
import { loadConfig, loadEnvFile } from './kernel/config';
import { createContextFactory } from './kernel/context';
import { createDatabase } from './kernel/database';
import { createEventDispatcher } from './kernel/events/dispatcher';
import { createJobRunner } from './kernel/jobs/job-runner';
import { createRegistry } from './kernel/module-system/registry';
import { modules } from './modules';

// Start-up, in order: read settings, connect to the database and prove it works, build the web server, start listening.
loadEnvFile();
const config = loadConfig();
const database = createDatabase(config.db);
await database.ping();
await database.verifyRoles();

const registry = createRegistry(modules);
const contextFor = createContextFactory(database);

// Background work: events are delivered to the modules that listen for them, and scheduled/queued jobs run.
// Both report to /health. The web server is built last so it can list them.
const app = await buildApp({ config, database, registry, healthChecks: [] });
const gate = app.kernel.gate; // is this module on for this business? (built from the module-switches module)
const eventDispatcher = createEventDispatcher({ database, registry, gate, contextFor, logger: app.log });
// A scheduled job has no business of its own, so it is given the list of business ids and queues one job per business
const listAccountIds = async () => {
  const rows = await database.system.selectFrom('accounts').select('id').execute();
  return rows.map((row) => row.id);
};
const jobRunner = createJobRunner({ config, registry, gate, contextFor, listAccountIds, logger: app.log });
app.kernel.healthChecks.push(eventDispatcher.healthCheck, jobRunner.healthCheck);
await jobRunner.start();
eventDispatcher.start();

// Shuts down once, cleanly: stop taking requests, close database connections, then exit.
let isShuttingDown = false;
const shutDownGracefully = async (signalName: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  app.log.info({ signal: signalName }, 'shutting down');
  await app.close(); // stop taking requests first
  await eventDispatcher.stop(); // then let the delivery in progress finish
  await jobRunner.stop();
  await database.close();
  process.exit(0);
};
for (const signalName of ['SIGINT', 'SIGTERM']) process.on(signalName, () => void shutDownGracefully(signalName));

// A crash is logged with its reason before the process ends (the process manager starts it again)
for (const crashEventName of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(crashEventName, (error) => {
    app.log.fatal({ err: error }, crashEventName);
    process.exit(1);
  });
}

await app.listen({ port: config.port, host: config.host });
