import { z } from 'zod';
import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import { recordHumanCallback } from '../helpers/agent-conversation-state';
import { promiseContextOf, type AgentTurnData, type StateHolder } from '../helpers/agent-turn-data';

/**
 * `request_human_callback`: the agent asks for a person to follow up, for anything that is not a sale. It answers with the exact words to
 * say. The ticket itself is made by the router when the conversation ends (as the conversations module already does).
 */
export function makeRequestHumanCallbackTool(input: { data: AgentTurnData; holder: StateHolder }): AgentToolDefinition {
  return {
    name: 'request_human_callback',
    description:
      'Asks for a person on the team to follow up. Use it for a complaint, a problem with an order or booking, or anything that is not a sale. Give a short reason in your own words, with no personal details. It tells you what to say.',
    inputSchema: z.object({ reason: z.string().trim().min(1).max(300) }).strict(),
    effect: 'ticket',
    run: async (toolInput) => {
      const { reason } = toolInput as { reason: string };
      const change = recordHumanCallback(input.holder.current, reason, promiseContextOf(input.data));
      input.holder.current = change.state;
      return change.messageForModel;
    },
  };
}
