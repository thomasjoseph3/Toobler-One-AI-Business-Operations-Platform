import { z } from 'zod';
import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import type { createKnowledgeSearchService } from '../../knowledge';

/** `search_knowledge`: looks for an answer in the business's confirmed FAQs. Only reads. */
export function makeSearchKnowledgeTool(input: {
  accountId: string;
  knowledgeSearch: ReturnType<typeof createKnowledgeSearchService>;
}): AgentToolDefinition {
  return {
    name: 'search_knowledge',
    description:
      "Searches the business's FAQs for an answer to the customer's question. Use it before saying you do not know. Pass the question in plain words.",
    inputSchema: z.object({ question: z.string().trim().min(1).max(300) }).strict(),
    effect: 'reads',
    run: async (toolInput) => {
      const { question } = toolInput as { question: string };
      // The business is the one this tool was built for; the model's words are only the text searched
      const found = await input.knowledgeSearch.searchKnowledge(input.accountId, question, 3);
      if (found.items.length === 0) {
        return 'Nothing found. Say you are not sure, say the team will get back to the customer, and call log_unanswered_question with their question.';
      }
      return found.items.map((item) => `Question: ${item.question}\nAnswer: ${item.answer}`).join('\n\n');
    },
  };
}
