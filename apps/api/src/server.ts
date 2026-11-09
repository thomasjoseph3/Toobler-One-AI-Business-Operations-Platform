import { buildApp } from './app';
import { loadConfig, loadEnvFile } from './kernel/config';
import { createDatabase } from './kernel/db';
import { createRegistry } from './kernel/modules/registry';
import { modules } from './modules';

// Start-up, in order: read settings, connect to the database and prove it works, build the web server, start listening.
loadEnvFile();
const config = loadConfig();
const database = createDatabase(config.db);
await database.ping();
await database.verifyRoles();

const app = await buildApp({ config, database, registry: createRegistry(modules) });

// Shuts down once, cleanly: stop taking requests, close database connections, then exit.
let isShuttingDown = false;
const shutDownGracefully = async (signalName: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  app.log.info({ signal: signalName }, 'shutting down');
  await app.close();
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
