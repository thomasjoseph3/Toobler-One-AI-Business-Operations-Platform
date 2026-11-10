import type { FastifyBaseLogger } from 'fastify';
import { PgBoss } from 'pg-boss';
import type { Config } from '../config';
import type { ContextFactory } from '../context';
import { buildSslOptions } from '../database';
import type { HealthCheck } from '../health';
import { isUuid } from '../ids';
import type { ModuleGate, Registry } from '../module-system/registry';
import type { JobData, JobDefinition } from './jobs';

export interface JobRunnerOptions {
  /** Where pg-boss keeps its own tables. */
  schema: string;
  /** How often a worker looks for a new job. */
  pollIntervalSeconds: number;
  /** /health reports a problem when the heartbeat job has not run for this long. */
  heartbeatStaleAfterMilliseconds: number;
}

const DEFAULT_OPTIONS: JobRunnerOptions = {
  schema: 'pgboss',
  pollIntervalSeconds: 2,
  heartbeatStaleAfterMilliseconds: 180_000,
};

const HEARTBEAT_JOB_NAME = 'kernel.heartbeat';

export interface JobRunner {
  /** Connects, creates the queues, starts the workers and the schedules. */
  start(): Promise<void>;
  /** Lets running jobs finish (up to 10 seconds), then disconnects. */
  stop(): Promise<void>;
  /** Queues a job. The job's module must have declared it. */
  enqueueJob(jobName: string, data: JobData): Promise<void>;
  /** For /health: fails when the runner is not started or its heartbeat job stopped running. */
  healthCheck: HealthCheck;
}

/**
 * Runs the background jobs that modules declare (`jobs` in the manifest), using pg-boss: queued jobs, retries with
 * growing waits, and cron schedules. It also runs one job of its own, `kernel.heartbeat` once a minute, so /health can
 * tell that jobs really are being picked up and run (this assumes one app instance for now).
 */
export function createJobRunner(dependencies: {
  config: Config;
  registry: Registry;
  gate: ModuleGate;
  contextFor: ContextFactory;
  logger: FastifyBaseLogger;
  options?: Partial<JobRunnerOptions>;
}): JobRunner {
  const { config, registry, gate, contextFor, logger } = dependencies;
  const options: JobRunnerOptions = { ...DEFAULT_OPTIONS, ...dependencies.options };

  const boss = new PgBoss({
    connectionString: config.db.url,
    ssl: buildSslOptions(config.db),
    schema: options.schema,
    max: 4,
    application_name: 'toobler-one-jobs',
  });
  boss.on('error', (error) => logger.error({ err: error }, 'job runner error'));

  // Every job a module declared, found by name, with the module that owns it.
  const declaredJobsByName = new Map<string, { moduleId: string; definition: JobDefinition }>();
  for (const moduleManifest of registry.modules) {
    for (const definition of moduleManifest.jobs ?? []) {
      declaredJobsByName.set(definition.name, { moduleId: moduleManifest.id, definition });
    }
  }

  let isStarted = false;
  let lastHeartbeatAt = 0;

  const enqueueJob = async (jobName: string, data: JobData): Promise<void> => {
    if (!declaredJobsByName.has(jobName)) throw new Error(`Job "${jobName}" is not declared by any module.`);
    if (data.accountId !== undefined && !isUuid(data.accountId))
      throw new Error(`Job "${jobName}" needs a valid accountId.`);
    await boss.send(jobName, data);
  };

  // Runs one declared job: skips it when its module is off for the business, otherwise gives it its context.
  const runDeclaredJob = async (jobName: string, data: JobData): Promise<void> => {
    const declared = declaredJobsByName.get(jobName)!;
    const accountId = data.accountId;
    if (accountId !== undefined) {
      if (!isUuid(accountId)) throw new Error(`Job "${jobName}" has no valid accountId.`);
      if (!(await gate.isActive(accountId, declared.moduleId))) {
        logger.info({ jobName, moduleId: declared.moduleId }, 'job skipped: module is off for this business');
        return;
      }
    }
    await declared.definition.run({
      data,
      accountContext: accountId === undefined ? undefined : contextFor(accountId, { kind: 'system', id: jobName }),
      enqueueJob,
      logger,
    });
  };

  // Creates the queue, starts a worker for it, and sets the cron schedule when the job has one.
  const startQueue = async (
    jobName: string,
    handler: (data: JobData) => Promise<void>,
    schedule?: string,
  ): Promise<void> => {
    await boss.createQueue(jobName, { retryLimit: 5, retryDelay: 30, retryBackoff: true });
    await boss.work(jobName, { pollingIntervalSeconds: options.pollIntervalSeconds }, async (jobs) => {
      for (const job of jobs) {
        try {
          await handler(job.data as JobData);
        } catch (error) {
          logger.error({ err: error, jobName, jobId: job.id }, 'job failed');
          throw error; // pg-boss tries again later, or marks it failed after the last attempt
        }
      }
    });
    if (schedule) await boss.schedule(jobName, schedule);
  };

  return {
    async start() {
      await boss.start();
      for (const [jobName, declared] of declaredJobsByName) {
        await startQueue(jobName, (data) => runDeclaredJob(jobName, data), declared.definition.schedule);
      }
      await startQueue(
        HEARTBEAT_JOB_NAME,
        async () => {
          lastHeartbeatAt = Date.now();
        },
        '* * * * *',
      );
      lastHeartbeatAt = Date.now(); // the first scheduled beat comes within a minute; count starting as a beat
      isStarted = true;
    },
    async stop() {
      isStarted = false;
      await boss.stop({ graceful: true, timeout: 10_000 });
    },
    enqueueJob,
    healthCheck: {
      name: 'job runner',
      async check() {
        if (!isStarted) throw new Error('not running');
        if (Date.now() - lastHeartbeatAt > options.heartbeatStaleAfterMilliseconds)
          throw new Error('jobs are not being picked up');
      },
    },
  };
}
