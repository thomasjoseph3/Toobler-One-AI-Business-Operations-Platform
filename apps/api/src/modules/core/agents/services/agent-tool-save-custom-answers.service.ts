import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import {
  recordCustomAnswers,
  saveCustomAnswersInputSchema,
  type SaveCustomAnswersInput,
} from '../helpers/agent-custom-answers';
import type { AgentTurnData, StateHolder } from '../helpers/agent-turn-data';

/**
 * `save_custom_answers`: saves what the customer said for the business's own questions (the fields marked "AI should ask"). Nothing is written to
 * the database here: the answers are kept in the conversation's state, and are added to the contact and the lead when the conversation's records
 * are made. An answer that does not fit its field is refused and the model is told to ask again.
 */
export function makeSaveCustomAnswersTool(input: { data: AgentTurnData; holder: StateHolder }): AgentToolDefinition {
  return {
    name: 'save_custom_answers',
    description:
      'Saves what the customer answered to one of the extra questions listed under "ALSO ASK". Pass the question name exactly as listed and the answer as the customer gave it (a date as YYYY-MM-DD). Save only what the customer said.',
    inputSchema: saveCustomAnswersInputSchema,
    effect: 'writes',
    run: async (toolInput) => {
      const change = recordCustomAnswers(
        input.holder.current,
        toolInput as SaveCustomAnswersInput,
        input.data.fieldsToAsk,
      );
      input.holder.current = change.state;
      return change.messageForModel;
    },
  };
}
