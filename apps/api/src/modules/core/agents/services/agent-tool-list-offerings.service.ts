import { z } from 'zod';
import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import { describeOffers, describeWhatWeSell } from '../helpers/build-agent-prompt';
import type { AgentTurnData } from '../helpers/agent-turn-data';

/** `list_offerings`: what the business sells, with its "from" prices and GST notes, and the offers that have not ended. Only reads. */
export function makeListOfferingsTool(data: AgentTurnData): AgentToolDefinition {
  return {
    name: 'list_offerings',
    description:
      'Reads what the business sells, with each "from" price, GST note and what is included, and the current offers. Use it when asked what is offered or what something costs. Give prices exactly as it writes them.',
    inputSchema: z.object({}).strict(),
    effect: 'reads',
    run: async () => `${describeWhatWeSell(data.whatWeSell)}\n\n${describeOffers(data.whatWeSell)}`,
  };
}
