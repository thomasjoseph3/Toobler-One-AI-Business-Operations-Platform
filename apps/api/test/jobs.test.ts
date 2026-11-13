import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createContextFactory } from '../src/kernel/context';
import type { Database } from '../src/kernel/database';
import { createJobRunner, type JobRunner } from '../src/kernel/jobs/job-runner';
import type { JobData, JobRun } from '../src/kernel/jobs/jobs';
import { defineModule } from '../src/kernel/module-system/define';
import { createRegistry, type ModuleGate } from '../src/kernel/module-system/registry';
import { createScriptedLlmProvider } from '../src/providers/llm';
import { newAccountId, openTestDatabase, waitFor } from './support/harness';
import { testConfig } from './support/app';

/** The services a job may use, for tests that do not look at them: real settings and database, no mail, no AI. */
const jobServices = () => ({
  config: testConfig(),
  database,
  mail: { send: async () => {} },
  llm: createScriptedLlmProvider(() => ({ answer: 'unused' })),
});

let database: Database;
let runner: JobRunner;

// Everything the probe job saw, in the order it ran.
const probeRuns: JobRun[] = [];
const probeModule = defineModule({
  id: 'feature.probe',
  kind: 'feature',
  jobs: [
    {
      name: 'probe.record',
      run: async (job) => {
        probeRuns.push(job);
        // Prove the job works inside the business's fence: write an activity line through its context.
        await job.accountContext?.runInAccountTransaction((transaction) =>
          job.accountContext!.audit(transaction, 'probe.ran'),
        );
      },
    },
  ],
});

// The probe module is off for one particular business.
const businessWithProbeOff = newAccountId();
const gate: ModuleGate = { isActive: async (accountId) => accountId !== businessWithProbeOff };

beforeAll(async () => {
  database = openTestDatabase();
  runner = createJobRunner({
    config: testConfig(),
    registry: createRegistry([probeModule]),
    gate,
    contextFor: createContextFactory(database),
    listAccountIds: async () => [],
    services: jobServices(),
    logger: pino({ level: 'silent' }),
    // A separate pg-boss schema for tests, and fast polling so the tests don't wait.
    options: { schema: 'pgboss_test', pollIntervalSeconds: 0.5 },
  });
  await runner.start();
});
afterAll(async () => {
  await runner.stop();
  await database.close();
});

const ranForData = (data: JobData) => probeRuns.find((run) => run.data['marker'] === data['marker']);

describe('job runner', () => {
  it("runs a queued job with a context fenced to the job's business", async () => {
    const accountId = newAccountId();
    const data = { accountId, marker: `run-${accountId}` };
    await runner.enqueueJob('probe.record', data);
    await waitFor(() => ranForData(data) !== undefined);

    expect(ranForData(data)?.accountContext?.accountId).toBe(accountId);
    expect(ranForData(data)?.accountContext?.actor).toEqual({ kind: 'system', id: 'probe.record' });
    // The activity line the job wrote belongs to that business only.
    await waitFor(async () => {
      const lines = await database.system
        .selectFrom('activity_log')
        .selectAll()
        .where('account_id', '=', accountId)
        .execute();
      return lines.length === 1;
    });
  });

  it('skips a job whose module is off for the business', async () => {
    const jobForBusinessWithProbeOff = { accountId: businessWithProbeOff, marker: 'skipped' };
    const jobForNormalBusiness = { accountId: newAccountId(), marker: 'after-skipped' };
    await runner.enqueueJob('probe.record', jobForBusinessWithProbeOff);
    await runner.enqueueJob('probe.record', jobForNormalBusiness);
    await waitFor(() => ranForData(jobForNormalBusiness) !== undefined);
    expect(ranForData(jobForBusinessWithProbeOff)).toBeUndefined();
  });

  it('refuses a job nobody declared and a job with a bad business id', async () => {
    await expect(runner.enqueueJob('nobody.declared', {})).rejects.toThrow(/not declared/);
    await expect(runner.enqueueJob('probe.record', { accountId: 'not-a-uuid' })).rejects.toThrow(/valid accountId/);
  });

  it('reports itself healthy while running', async () => {
    await runner.healthCheck.check();
  });
});

describe('job runner heartbeat', () => {
  it('fails /health when the heartbeat job has not run for too long', async () => {
    const impatientRunner = createJobRunner({
      config: testConfig(),
      registry: createRegistry([]),
      gate,
      contextFor: createContextFactory(database),
      listAccountIds: async () => [],
      services: jobServices(),
      logger: pino({ level: 'silent' }),
      options: { schema: 'pgboss_test', heartbeatStaleAfterMilliseconds: 1 },
    });
    await impatientRunner.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 20)); // the next beat is up to a minute away
      await expect(impatientRunner.healthCheck.check()).rejects.toThrow('not being picked up');
    } finally {
      await impatientRunner.stop();
    }
  });
});

describe('job runner health when not started', () => {
  it('fails /health until started', async () => {
    const idleRunner = createJobRunner({
      config: testConfig(),
      registry: createRegistry([]),
      gate,
      contextFor: createContextFactory(database),
      listAccountIds: async () => [],
      services: jobServices(),
      logger: pino({ level: 'silent' }),
      options: { schema: 'pgboss_test' },
    });
    await expect(idleRunner.healthCheck.check()).rejects.toThrow('not running');
  });
});
