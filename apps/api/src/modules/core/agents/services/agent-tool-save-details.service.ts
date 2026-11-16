import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import { recordDetails, saveDetailsInputSchema, type SaveDetailsInput } from '../helpers/agent-conversation-state';
import { promiseContextOf, type AgentTurnData, type StateHolder } from '../helpers/agent-turn-data';

/**
 * `save_details`: saves what the customer has told us. It also decides, in code, whether it is time for the promise, and answers with
 * the exact words to say. Nothing is written to the database here: the details are kept in the conversation's state, and the
 * router makes the contact and the lead when the conversation ends.
 */
export function makeSaveDetailsTool(input: { data: AgentTurnData; holder: StateHolder }): AgentToolDefinition {
  return {
    name: 'save_details',
    description:
      'Saves what the customer has told you: name, phone, email, what they want, dates, number of people, budget, best time to call, and whether they are ready to book. Call it whenever you learn something new. Save only what the customer said. It tells you what to say or ask next.',
    inputSchema: saveDetailsInputSchema,
    effect: 'writes',
    run: async (toolInput) => {
      const change = recordDetails(input.holder.current, toolInput as SaveDetailsInput, promiseContextOf(input.data));
      input.holder.current = change.state;
      return change.messageForModel;
    },
  };
}
