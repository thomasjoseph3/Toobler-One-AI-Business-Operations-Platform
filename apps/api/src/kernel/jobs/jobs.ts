import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';
import type { AccountContext } from '../context';
import type { Database } from '../database';
import type { LlmProvider } from '../../providers/llm';
import type { MailSender } from '../../providers/mail';

/** What is stored with a job. `accountId` (when present) is the business the job is for. */
export type JobData = { accountId?: string } & Record<string, unknown>;

/**
 * The services a job may need besides its business context: the settings, the database (for work across businesses, like a nightly
 * check), the mail sender and the AI model layer. The same ones the web routes reach through `app.kernel`.
 */
export interface JobServices {
  config: Config;
  database: Database;
  mail: MailSender;
  llm: LlmProvider;
}

/** What a job's code receives when it runs. */
export interface JobRun {
  data: JobData;
  /** Set when the job's data has an `accountId`: the context for that business (fenced, with audit and publish). */
  accountContext: AccountContext | undefined;
  /** Queues another job, for example one per business from a job that loops over businesses. */
  enqueueJob(jobName: string, data: JobData): Promise<void>;
  /** The ids of every business, for a scheduled job that has no business of its own and queues one job per business. Ids only. */
  listAccountIds(): Promise<string[]>;
  logger: FastifyBaseLogger;
  services: JobServices;
}

/**
 * Background work a module owns. The name is `<module>.<what>` (for the module `core.tasks`: `tasks.remind`).
 * A job that fails is tried again with a growing wait. Jobs may run twice, so write them to be safe to repeat.
 * `schedule` (a cron time such as `0 3 * * *`) makes the job run by itself; such jobs have no business, so they should
 * queue one job per business and let those do the real work.
 */
export interface JobDefinition {
  name: string;
  schedule?: string;
  run(job: JobRun): Promise<void>;
}

/** Job names look like `tasks.remind`. */
export const JOB_NAME_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
