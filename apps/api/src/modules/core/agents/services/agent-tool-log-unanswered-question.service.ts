import { z } from 'zod';
import type { Actor } from '../../../../kernel/context';
import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import type { createUnansweredQuestionsService } from '../../knowledge';
import type { TurnTracker } from '../helpers/agent-turn-data';

/** The actor stamped on what the agent writes: the agent module, not a signed-in person. */
export const AGENT_ACTOR: Actor = { kind: 'agent', id: 'core.agents' };

/** `log_unanswered_question`: writes down a question nobody could answer, for the owner to answer later. */
export function makeLogUnansweredQuestionTool(input: {
  accountId: string;
  tracker: TurnTracker;
  unansweredQuestions: Pick<ReturnType<typeof createUnansweredQuestionsService>, 'logUnansweredQuestion'>;
}): AgentToolDefinition {
  return {
    name: 'log_unanswered_question',
    description:
      "Writes down a question you could not answer, so the owner can answer it later. Use it only after search_knowledge found nothing. Pass the customer's question in plain words, without their name or contact details.",
    inputSchema: z.object({ question: z.string().trim().min(1).max(500) }).strict(),
    effect: 'writes',
    run: async (toolInput) => {
      const { question } = toolInput as { question: string };
      // A question is only "unanswered" once the FAQs were searched: a model that skips the search would log questions the business has answered
      if (!input.tracker.searchedTheKnowledge) {
        return 'Not written down yet. First look for the answer with search_knowledge. Write the question down only if nothing is found.';
      }
      await input.unansweredQuestions.logUnansweredQuestion(input.accountId, AGENT_ACTOR, question);
      return 'Noted for the owner. Tell the customer you are not sure and that the team will get back to them. Do not guess an answer.';
    },
  };
}
