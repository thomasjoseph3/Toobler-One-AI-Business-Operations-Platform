import { z } from 'zod';
import type { AgentToolDefinition } from '../../../../kernel/module-system/define';
import { describeBusinessFacts, describeSituations } from '../helpers/build-agent-prompt';
import type { AgentTurnData } from '../helpers/agent-turn-data';

/** `get_business_info`: what the business has told the agent about itself, and how it wants common moments handled. Only reads. */
export function makeGetBusinessInfoTool(data: AgentTurnData): AgentToolDefinition {
  return {
    name: 'get_business_info',
    description:
      'Reads what the business has told you about itself (address, opening hours, payment methods, policies) and how it wants common moments handled (a discount request, a complaint). Use it when asked about the business itself.',
    inputSchema: z.object({}).strict(),
    effect: 'reads',
    run: async () => `${describeBusinessFacts(data.knowledge)}\n\n${describeSituations(data.knowledge)}`,
  };
}
