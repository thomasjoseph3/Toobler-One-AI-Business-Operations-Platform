import type { SuggestedOffering } from '@toobler-one/shared';
import type { createAiService } from '../../ai';
import type { PrefilledAnswer, QuestionDefinition } from '../../knowledge';
import {
  buildExtractionInstructions,
  buildPagesMessage,
  EXTRACTION_PROMPT_VERSION,
  extractionOutputSchema,
  readExtractionOutput,
} from '../helpers/build-extraction-prompt';

/** The part of the AI service this needs: only the call that returns an answer in a fixed shape. */
export type ExtractionAiService = Pick<ReturnType<typeof createAiService>, 'generateObject'>;

/**
 * Asks the AI what a business's pages say about the questions a website can fill in. The AI states what the pages say; every answer
 * is checked later against its own question, and nothing here is saved. Throws the AI service's error (for example
 * `AI_NOT_AVAILABLE`) when no AI can answer.
 */
export function createWebsiteAnswerExtractor({ aiService }: { aiService: ExtractionAiService }) {
  return {
    async extractAnswers(input: {
      accountId: string;
      questions: readonly QuestionDefinition[];
      pages: ReadonlyArray<{ url: string; text: string }>;
    }): Promise<{ answers: PrefilledAnswer[]; suggestedOfferings: SuggestedOffering[] }> {
      const result = await aiService.generateObject(
        {
          accountId: input.accountId,
          tag: {
            task: 'extract_from_website',
            agentId: 'setup',
            channel: 'internal',
            promptVersion: EXTRACTION_PROMPT_VERSION,
          },
          prompt: {
            stableSystemText: buildExtractionInstructions(input.questions),
            messages: [{ role: 'user', text: buildPagesMessage(input.pages) }],
          },
          // Reading must give the same answers for the same pages as far as possible
          temperature: 0,
          maxOutputTokens: 4000,
        },
        extractionOutputSchema,
      );
      return readExtractionOutput(result.value, input.questions);
    },
  };
}
