import type { LlmCallDetails } from '../../../../providers/llm';
import type { createAiService } from '../../ai';
import {
  CLASSIFIER_PROMPT_VERSION,
  buildChangingInstructions,
  buildClassificationSchema,
  buildConversationMessage,
  buildStableInstructions,
  type ClassifierFacts,
  type ClassifierType,
  type TranscriptLine,
} from '../helpers/classifier-prompt';
import type { TypeClassification } from '../helpers/router';

/** What the classifier needs of the AI service: only the call that returns an answer in a fixed shape. */
type AiServiceForClassifying = Pick<ReturnType<typeof createAiService>, 'generateObject'>;

/** What is asked: whose conversation it is, how it came in, the business's types, and what was said. */
export interface ClassifyConversationInput {
  accountId: string;
  /** How the person got in touch (recorded in the AI usage, so it can be split by channel). */
  channel: string;
  conversationId?: string | null;
  /** The business's switched-on types, as the AI is told about them. */
  types: readonly ClassifierType[];
  transcript: readonly TranscriptLine[];
  facts?: ClassifierFacts;
}

/** What comes back: what the conversation was about (ready for the router), the AI's reason, and which AI answered. */
export interface ConversationClassification {
  classification: TypeClassification;
  reason: string;
  servedBy: LlmCallDetails['servedBy'];
}

/**
 * Sorts a conversation: asks the AI, through the business's AI settings (the job `classify_conversation`, never a model name), what
 * it was about, and checks the answer against the business's own list of types. It says WHAT the conversation was about; it never
 * decides what happens next (that is the router, which is plain code). Never saves anything.
 */
export function createConversationClassifier({ aiService }: { aiService: AiServiceForClassifying }) {
  return {
    async classifyConversation(input: ClassifyConversationInput): Promise<ConversationClassification> {
      const schema = buildClassificationSchema(input.types.map((type) => type.key));
      const changingSystemText = buildChangingInstructions(input.facts ?? {});

      const answer = await aiService.generateObject(
        {
          accountId: input.accountId,
          tag: {
            task: 'classify_conversation',
            agentId: 'classifier',
            channel: input.channel,
            promptVersion: CLASSIFIER_PROMPT_VERSION,
            conversationId: input.conversationId ?? null,
          },
          prompt: {
            stableSystemText: buildStableInstructions(input.types),
            ...(changingSystemText === '' ? {} : { changingSystemText }),
            messages: [{ role: 'user', text: buildConversationMessage(input.transcript) }],
          },
          // Sorting must give the same answer for the same conversation as far as possible
          temperature: 0,
          maxOutputTokens: 600,
        },
        schema,
      );

      const { primary, secondary, needsPerson, reason } = answer.value;
      return {
        classification: {
          primary: { typeKey: primary.type, confidence: primary.confidence },
          secondary: secondary.map((other) => ({ typeKey: other.type, confidence: other.confidence })),
          needsPerson,
        },
        reason,
        servedBy: answer.details.servedBy,
      };
    },
  };
}
