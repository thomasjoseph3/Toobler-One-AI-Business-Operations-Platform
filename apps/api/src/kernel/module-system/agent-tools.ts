import type { AgentToolContext, AgentToolDefinition } from './define';
import { RegistryError, type ModuleGate, type Registry } from './registry';

/**
 * The tools the modules add to the AI agent for this business and conversation: those of every module that has `agentTools` AND is on
 * for the business (core modules always, others when entitled, enabled and ready). A module that is off adds nothing, and its tools
 * do not exist for the agent. Two tools with the same name are a mistake in the modules, and it is reported at once.
 */
export async function collectAgentTools(input: {
  registry: Registry;
  gate: ModuleGate;
  context: AgentToolContext;
}): Promise<AgentToolDefinition[]> {
  const tools: AgentToolDefinition[] = [];
  const moduleIdByToolName = new Map<string, string>();
  for (const manifest of input.registry.modules) {
    if (!manifest.agentTools) continue;
    if (!(await input.gate.isActive(input.context.accountId, manifest.id))) continue;
    for (const tool of manifest.agentTools(input.context)) {
      const otherModuleId = moduleIdByToolName.get(tool.name);
      if (otherModuleId) {
        throw new RegistryError(`Agent tool "${tool.name}" is added by both "${otherModuleId}" and "${manifest.id}".`);
      }
      moduleIdByToolName.set(tool.name, manifest.id);
      tools.push(tool);
    }
  }
  return tools;
}
