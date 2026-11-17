import type { PrefillRun, StartPrefillRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import { parseWebsiteAddress } from '../helpers/public-address';
import { readListingSearchText } from '../helpers/read-listing-query';
import * as prefillRunsRepository from '../repositories/prefill-runs.repository';
import type { PrefillRunRow } from '../repositories/prefill-runs.repository';

/** How many readings a business may start in a day. Each one reads web pages and uses the AI. */
export const MAXIMUM_READINGS_PER_DAY = 10;
/** A reading still going after this long is treated as stuck, and a new one may start. */
const STUCK_AFTER_MILLISECONDS = 10 * 60 * 1000;
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/** A run as the API answers with it. */
export function toPrefillRun(row: PrefillRunRow): PrefillRun {
  return {
    id: row.id,
    status: row.status,
    websiteUrl: row.websiteUrl,
    googleListing: row.googleListing,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    pagesRead: row.pagesRead,
    answersFound: row.answersFound,
    answersSkipped: row.answersSkipped,
    suggestedOfferings: row.suggestedOfferings,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/** Starting a reading and checking on it. The routes call this; the reading itself is a background job (run-prefill.service.ts). */
export function createPrefillService(dependencies: {
  database: Database;
  enqueueJob: (jobName: string, data: { accountId: string; runId: string }) => Promise<void>;
  /** Whether Google listings are switched on (a key is set). */
  isGoogleListingSwitchedOn: boolean;
  now?: () => Date;
}) {
  const { database, enqueueJob, isGoogleListingSwitchedOn } = dependencies;
  const now = dependencies.now ?? (() => new Date());

  return {
    /**
     * Checks what the owner gave (an address that is not a public website, a Google listing that cannot be read, Google switched
     * off) and answers 400 at once, before any waiting. Then queues the reading and answers with the new run. 409
     * PREFILL_ALREADY_RUNNING when one is already going; 429 PREFILL_LIMIT_REACHED after ten in a day.
     */
    async startPrefill(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: StartPrefillRequest,
    ): Promise<PrefillRun> {
      const websiteUrl = request.websiteUrl === undefined ? null : parseWebsiteAddress(request.websiteUrl).href;
      let googleListing: string | null = null;
      if (request.googleListing !== undefined) {
        if (!isGoogleListingSwitchedOn) {
          throw new ApiError(
            400,
            'GOOGLE_LISTING_NOT_SWITCHED_ON',
            "Reading Google listings isn't switched on yet. Give a website, or type the answers.",
          );
        }
        readListingSearchText(request.googleListing); // refuses a link we cannot read, now rather than later
        googleListing = request.googleListing;
      }

      const accountId = principal.accountId;
      const actor: Actor = { kind: 'user', id: principal.userId };
      const runId = uuidv7();
      const startedAt = now();
      await database.runInAccountTransaction(accountId, async (transaction) => {
        const activeRunId = await prefillRunsRepository.findActiveRunId(
          transaction,
          accountId,
          new Date(startedAt.getTime() - STUCK_AFTER_MILLISECONDS),
        );
        if (activeRunId) {
          throw new ApiError(
            409,
            'PREFILL_ALREADY_RUNNING',
            'We are already reading for you. Please wait for it to finish.',
            {
              runId: activeRunId,
            },
          );
        }
        const startedToday = await prefillRunsRepository.countRunsSince(
          transaction,
          accountId,
          new Date(startedAt.getTime() - ONE_DAY_MILLISECONDS),
        );
        if (startedToday >= MAXIMUM_READINGS_PER_DAY) {
          throw new ApiError(
            429,
            'PREFILL_LIMIT_REACHED',
            `You can start ${MAXIMUM_READINGS_PER_DAY} readings a day. Please try again tomorrow, or type the answers.`,
          );
        }
        await prefillRunsRepository.insertRun(transaction, { id: runId, accountId, websiteUrl, googleListing, actor });
        await writeActivityLog(transaction, {
          accountId,
          actor,
          kind: 'setup.prefill_started',
          // What kind of reading, never the address or the name
          details: {
            recordType: 'prefill_run',
            fields: [websiteUrl ? 'website' : '', googleListing ? 'google_listing' : ''].filter(Boolean),
          },
        });
      });

      // After the run is saved, so the job always finds it. If queueing fails the owner is told and nothing is left waiting.
      try {
        await enqueueJob('setup.run_prefill', { accountId, runId });
      } catch (error) {
        await database.runInAccountTransaction(accountId, (transaction) =>
          prefillRunsRepository.markFinished(transaction, {
            accountId,
            runId,
            status: 'failed',
            errorCode: 'PREFILL_NOT_STARTED',
            errorMessage: 'We could not start reading. Please try again.',
            pagesRead: 0,
            answersFound: [],
            answersSkipped: 0,
            suggestedOfferings: [],
          }),
        );
        throw error;
      }
      const run = await database.runInAccountTransaction(accountId, (transaction) =>
        prefillRunsRepository.findRun(transaction, accountId, runId),
      );
      return toPrefillRun(run!);
    },

    /** One reading of this business: where it is up to and what it found. 404 for another business's reading. */
    async getPrefill(principal: Pick<Principal, 'accountId'>, runId: string): Promise<PrefillRun> {
      const run = await database.runInAccountTransaction(principal.accountId, (transaction) =>
        prefillRunsRepository.findRun(transaction, principal.accountId, runId),
      );
      if (!run) throw notFound('That reading');
      return toPrefillRun(run);
    },
  };
}
