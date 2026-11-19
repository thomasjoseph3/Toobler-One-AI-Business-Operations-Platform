import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { collectAgentTools } from './agent-tools';
import { defineModule, type AgentToolDefinition } from './define';
import { createRegistry, RegistryError, type ModuleGate } from './registry';

const context = { accountId: 'business-1', conversationId: 'conversation-1', channel: 'whatsapp' };

/** A tool that only has a name, for these tests. */
const toolNamed = (name: string): AgentToolDefinition => ({
  name,
  description: 'x',
  inputSchema: z.object({}),
  effect: 'sends',
  run: async () => 'done',
});

/** A gate where only the listed modules are on (core modules are not special here, so the tests say what is on). */
const gateWithOn = (...moduleIds: string[]): ModuleGate => ({
  isActive: async (_accountId, moduleId) => moduleIds.includes(moduleId),
});

const whatsapp = defineModule({
  id: 'channel.whatsapp',
  kind: 'channel',
  agentTools: () => [toolNamed('send_details_whatsapp')],
});
const phone = defineModule({
  id: 'channel.phone',
  kind: 'channel',
  agentTools: () => [toolNamed('transfer_call'), toolNamed('end_call')],
});
const plainModule = defineModule({ id: 'core.plain', kind: 'core' });

describe('collectAgentTools (plug and play: a module adds tools only while it is on)', () => {
  const registry = createRegistry([whatsapp, phone, plainModule]);

  it('gives the tools of the modules that are on, and none of the ones that are off', async () => {
    const tools = await collectAgentTools({ registry, gate: gateWithOn('channel.whatsapp'), context });
    expect(tools.map((tool) => tool.name)).toEqual(['send_details_whatsapp']);
  });

  it('gives nothing when every module with tools is off, and everything when all are on', async () => {
    expect(await collectAgentTools({ registry, gate: gateWithOn(), context })).toEqual([]);
    const all = await collectAgentTools({
      registry,
      gate: gateWithOn('channel.whatsapp', 'channel.phone'),
      context,
    });
    expect(all.map((tool) => tool.name).sort()).toEqual(['end_call', 'send_details_whatsapp', 'transfer_call']);
  });

  it('hands the business, the conversation and the channel to the module that builds the tools', async () => {
    const seen: unknown[] = [];
    const watching = defineModule({
      id: 'channel.watching',
      kind: 'channel',
      agentTools: (toolContext) => {
        seen.push(toolContext);
        return [];
      },
    });
    await collectAgentTools({
      registry: createRegistry([watching]),
      gate: gateWithOn('channel.watching'),
      context,
    });
    expect(seen).toEqual([context]);
  });

  it('does not even build the tools of a module that is off', async () => {
    let built = false;
    const off = defineModule({
      id: 'channel.off',
      kind: 'channel',
      agentTools: () => {
        built = true;
        return [];
      },
    });
    await collectAgentTools({ registry: createRegistry([off]), gate: gateWithOn(), context });
    expect(built).toBe(false);
  });

  it('reports two modules adding a tool with the same name', async () => {
    const twin = defineModule({
      id: 'channel.twin',
      kind: 'channel',
      agentTools: () => [toolNamed('send_details_whatsapp')],
    });
    await expect(
      collectAgentTools({
        registry: createRegistry([whatsapp, twin]),
        gate: gateWithOn('channel.whatsapp', 'channel.twin'),
        context,
      }),
    ).rejects.toThrow(RegistryError);
  });
});
