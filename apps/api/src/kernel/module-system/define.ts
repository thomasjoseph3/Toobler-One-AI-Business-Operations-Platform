import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';
import type { Config } from '../config';
import type { Database } from '../database';
import type { EventHandlers } from '../events/events';
import type { Authenticator } from '../http/guard';
import type { JobDefinition } from '../jobs/jobs';
import type { ModuleGate, Registry } from './registry';

/**
 * Module kinds (docs/ARCHITECTURE.md): core is always on; engines, channels and features are switched on per business.
 */
export type ModuleKind = 'core' | 'engine' | 'channel' | 'feature';

/**
 * What a tool does, so the agent's own code never has to know a module's tool names: `reads` only looks something up, `writes` saves
 * something, `sends` sends something to the customer, `ticket` raises something for the team.
 */
export type AgentToolEffect = 'reads' | 'writes' | 'sends' | 'ticket';

/** What a module is told when the agent asks for its tools: which business and conversation, and the channel it is on. */
export interface AgentToolContext {
  accountId: string;
  /** The conversation being answered, or null when there is none saved (a test chat before it is saved). */
  conversationId: string | null;
  /** The channel the conversation is on: `webchat`, `whatsapp`, `email` or `phone`. */
  channel: string;
}

/**
 * One thing a module lets the AI agent do. It is built for ONE business and conversation, so what it touches is fixed by the code that
 * builds it: the model supplies only the input, which is checked against `inputSchema` before `run` is called.
 */
export interface AgentToolDefinition {
  name: string;
  /** Tells the model when to use it. */
  description: string;
  inputSchema: ZodType;
  effect: AgentToolEffect;
  /** Does the work and gives the model the result as text. */
  run(input: unknown): Promise<string>;
}

export interface ModuleManifest {
  /** `<kind>.<name>`, e.g. `core.contacts`, `engine.leads`, `channel.whatsapp` */
  id: string;
  kind: ModuleKind;
  /** Modules whose public API (index.ts) this one uses. They must be active for this one to be active. */
  requires?: string[];
  /** Registers this module's routes. Mounted under /api/v1; every route declares `config.access`. */
  routes?: (app: FastifyInstance) => void | Promise<void>;
  /**
   * Only the `core.auth` module sets this: it builds the function that turns a request's cookies into a signed-in person.
   * The kernel picks it up from the registry, so the kernel never imports the module.
   */
  authenticator?: (services: { config: Config; database: Database }) => Authenticator;
  /**
   * Only the `core.module_switches` module sets this: it builds the gate that says whether a module is on for a business.
   * The kernel picks it up from the registry (like the authenticator), so the kernel never imports the module.
   */
  moduleGate?: (services: { config: Config; database: Database; registry: Registry }) => ModuleGate;
  /**
   * The tools this module adds to the AI agent, such as WhatsApp's "send the details". Offered to the agent only for a business that has
   * the module switched on, so switching it off removes them. Gets the business and conversation and builds the tools for them.
   */
  agentTools?: (context: AgentToolContext) => AgentToolDefinition[];
  /** Events this module reacts to (the module's handlers run only while the module is on for the business). */
  events?: EventHandlers;
  /** Background jobs this module owns, named `<module name>.<what>`. */
  jobs?: JobDefinition[];
}

/**
 * Declares a module. Returns the manifest exactly as given, but checked against ModuleManifest, so a mistake in a
 * manifest is a compile error. The kernel reads manifests; nothing else is registered by hand.
 */
export const defineModule = <SpecificManifest extends ModuleManifest>(manifest: SpecificManifest): SpecificManifest =>
  manifest;
