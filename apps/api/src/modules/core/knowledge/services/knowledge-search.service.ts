import { DEFAULT_SEARCH_RESULTS } from '@toobler-one/shared';
import type { SearchResponse } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import * as faqsRepository from '../repositories/faqs.repository';

/**
 * Searching what the business has told the AI. The staff route and the AI agent (F19, through the knowledge module's index) both call
 * this one function, so a better search later (for example with vectors) changes only this file and its repository query.
 * Today it searches FAQs only; passages from documents join the same list if documents are ever built.
 */
export function createKnowledgeSearchService({ database }: { database: Database }) {
  return {
    /**
     * Finds the passages that answer the customer's question, best match first, with where each came from. Only usable FAQs are
     * found: not removed ones and not ones waiting for a check. Gives an empty list when nothing matches (never a guess). The business
     * comes from the caller, never from the text searched.
     */
    async searchKnowledge(
      accountId: string,
      text: string,
      limit: number = DEFAULT_SEARCH_RESULTS,
    ): Promise<SearchResponse> {
      const found = await database.runInAccountTransaction(accountId, (transaction) =>
        faqsRepository.searchConfirmedFaqs(transaction, { accountId, text, limit }),
      );
      return {
        items: found.map((faq) => ({
          sourceKind: 'faq' as const,
          sourceId: faq.id,
          question: faq.question,
          answer: faq.answer,
          // Rounded: the exact decimals mean nothing, the order does
          score: Math.round(faq.score * 1000) / 1000,
        })),
      };
    },
  };
}
