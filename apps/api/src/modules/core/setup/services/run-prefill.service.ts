import type { SuggestedOffering } from '@toobler-one/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Actor } from '../../../../kernel/context';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import type { PlacesProvider } from '../../../../providers/places';
import { findBusinessIdentity } from '../../auth';
import { createPrefilledAnswersService, listPrefillableQuestions, type PrefilledAnswer } from '../../knowledge';
import { factsToAnswers } from '../helpers/facts-to-answers';
import { listingToAnswers } from '../helpers/listing-to-answers';
import { readListingSearchText } from '../helpers/read-listing-query';
import * as prefillRunsRepository from '../repositories/prefill-runs.repository';
import type { createWebsiteAnswerExtractor } from './extract-website-answers.service';
import type { WebsiteReader } from './read-website.service';

const PREFILL_ACTOR: Actor = { kind: 'system', id: 'setup.prefill' };

/** The answers of one source, by question, first one wins. */
function firstAnswerPerQuestion(answers: readonly PrefilledAnswer[]): PrefilledAnswer[] {
  const seen = new Set<string>();
  return answers.filter((answer) => (seen.has(answer.questionKey) ? false : (seen.add(answer.questionKey), true)));
}

/**
 * Runs one reading of a business's website and/or Google listing, as a background job. The owner has already been told it is
 * reading and carries on meanwhile. It saves what it finds as answers "waiting for a check" (never confirmed, never over an answer the
 * owner confirmed) and notes what the site seems to sell as suggestions. It is safe to run twice (a finished run is left alone).
 *
 * Every expected problem (a website that cannot be read, no AI available, Google not switched on) is written on the run in plain
 * words instead of being thrown, because trying the same thing again later would not help; the owner starts a new reading.
 */
export function createRunPrefillService(dependencies: {
  database: Database;
  websiteReader: WebsiteReader;
  answerExtractor: ReturnType<typeof createWebsiteAnswerExtractor>;
  /** Null when Google listings are not switched on (no key). */
  placesProvider: PlacesProvider | null;
  logger: FastifyBaseLogger;
}) {
  const { database, websiteReader, answerExtractor, placesProvider, logger } = dependencies;
  const prefilledAnswers = createPrefilledAnswersService({ database });

  return {
    async runPrefill(accountId: string, runId: string): Promise<void> {
      const startedRun = await database.runInAccountTransaction(accountId, async (transaction) => {
        const lockedRun = await prefillRunsRepository.lockRun(transaction, accountId, runId);
        if (!lockedRun) throw notFound('That reading');
        if (lockedRun.status === 'done' || lockedRun.status === 'failed') return undefined; // already finished: nothing to do
        await prefillRunsRepository.markReading(transaction, accountId, runId);
        const identity = await findBusinessIdentity(transaction, accountId);
        if (!identity) throw notFound('That business');
        return { run: lockedRun, industryId: identity.industry };
      });
      if (!startedRun) return;
      const { run, industryId } = startedRun;

      const problems: ApiError[] = [];
      let succeededAtLeastOnce = false;
      let pagesRead = 0;
      let suggestedOfferings: SuggestedOffering[] = [];
      const answersFound: string[] = [];
      let answersSkipped = 0;

      /** Saves one source's answers and adds up what was saved and what was left alone. */
      const saveAnswers = async (
        source: 'website' | 'listing',
        sourceReference: string,
        answers: PrefilledAnswer[],
      ) => {
        if (answers.length === 0) return;
        const saved = await prefilledAnswers.saveWaitingAnswers({
          accountId,
          industryId,
          actor: PREFILL_ACTOR,
          source,
          sourceReference,
          answers,
        });
        answersFound.push(...saved.saved);
        answersSkipped += saved.skippedBecauseConfirmed.length;
      };

      try {
        // The Google listing first: its answers (address, hours) are the better ones, so the website's do not replace them
        let listingAnswers: PrefilledAnswer[] = [];
        if (run.googleListing) {
          try {
            if (!placesProvider) {
              throw new ApiError(
                400,
                'GOOGLE_LISTING_NOT_SWITCHED_ON',
                "Reading Google listings isn't switched on yet. You can type those answers instead.",
              );
            }
            const place = await placesProvider.findPlace(readListingSearchText(run.googleListing));
            if (!place) {
              throw new ApiError(
                400,
                'GOOGLE_LISTING_NOT_FOUND',
                "We couldn't find that business on Google. Check the name and town.",
              );
            }
            listingAnswers = firstAnswerPerQuestion(listingToAnswers(place));
            await saveAnswers('listing', place.name ?? run.googleListing, listingAnswers);
            succeededAtLeastOnce = true;
          } catch (error) {
            if (!(error instanceof ApiError)) throw error;
            problems.push(error);
          }
        }

        if (run.websiteUrl) {
          try {
            const website = await websiteReader.readWebsite(run.websiteUrl);
            pagesRead = website.pages.length;
            // Answers the page's own data states come first, then the AI's reading; the listing's answers are not repeated
            const answersFromData = factsToAnswers({
              facts: website.facts,
              phones: website.phones,
              emails: website.emails,
            });
            let answersFromAi: PrefilledAnswer[] = [];
            try {
              const extracted = await answerExtractor.extractAnswers({
                accountId,
                questions: listPrefillableQuestions(industryId),
                pages: website.pages,
              });
              answersFromAi = extracted.answers;
              suggestedOfferings = extracted.suggestedOfferings;
            } catch (error) {
              if (!(error instanceof ApiError)) throw error;
              problems.push(error); // the page data below is still saved
            }
            const keysFromListing = new Set(listingAnswers.map((answer) => answer.questionKey));
            const websiteAnswers = firstAnswerPerQuestion([...answersFromData, ...answersFromAi]).filter(
              (answer) => !keysFromListing.has(answer.questionKey),
            );
            await saveAnswers('website', run.websiteUrl, websiteAnswers);
            succeededAtLeastOnce = true;
          } catch (error) {
            if (!(error instanceof ApiError)) throw error;
            problems.push(error);
          }
        }
      } catch (error) {
        // Not a problem we expected: log it without any page text, and tell the owner something plain
        logger.error({ err: error, runId }, 'setup prefill failed unexpectedly');
        problems.push(new ApiError(500, 'PREFILL_FAILED', 'Something went wrong while reading. Please try again.'));
      }

      const firstProblem = problems[0];
      const foundSomething = answersFound.length > 0 || suggestedOfferings.length > 0;
      const wentWell = (succeededAtLeastOnce && problems.length === 0) || foundSomething;
      await database.runInAccountTransaction(accountId, (transaction) =>
        prefillRunsRepository.markFinished(transaction, {
          accountId,
          runId,
          // A reading that found something is done, with the part that failed written on it; one that found nothing and had a problem, or died unexpectedly, failed
          status: wentWell && !problems.some((problem) => problem.code === 'PREFILL_FAILED') ? 'done' : 'failed',
          errorCode: firstProblem?.code ?? null,
          errorMessage: firstProblem?.message ?? null,
          pagesRead,
          answersFound: [...new Set(answersFound)],
          answersSkipped,
          suggestedOfferings,
        }),
      );
    },
  };
}
