import { z } from 'zod';

// The shape of the module list the API answers with. Which modules exist lives in the API (the module catalogue); the web
// app only shows what it is told, so a new module never needs a change here.

/** Where a module stands for the signed-in person's business. */
export const moduleStateSchema = z.enum([
  'active', // entitled and switched on: it works
  'off', // in the plan but switched off: its routes answer 404, its data is kept
  'not_in_plan', // the plan does not include it (only Toobler can add it)
  'needs_connecting', // switched on but the channel is not connected yet
]);
export type ModuleState = z.infer<typeof moduleStateSchema>;

export const moduleViewSchema = z.object({
  id: z.string(),
  kind: z.enum(['engine', 'channel', 'feature']),
  name: z.string(),
  description: z.string(),
  /** Ids of the modules that must be active before this one can be switched on */
  requires: z.array(z.string()),
  state: moduleStateSchema,
});
export type ModuleView = z.infer<typeof moduleViewSchema>;

export const modulesResponseSchema = z.object({ items: z.array(moduleViewSchema) });
export type ModulesResponse = z.infer<typeof modulesResponseSchema>;

/** What a manager sends to switch a module on or off. */
export const switchModuleRequestSchema = z.object({ enabled: z.boolean() }).strict();
export type SwitchModuleRequest = z.infer<typeof switchModuleRequestSchema>;

/** The address part naming a module, like `channel.webchat`. */
export const moduleIdParamsSchema = z.object({ id: z.string().regex(/^[a-z]+\.[a-z_]+$/) });

/** What the Toobler team sends to put a module into a business's plan (`entitled: true`) or take it out. */
export const setEntitlementRequestSchema = z
  .object({ moduleId: z.string().regex(/^[a-z]+\.[a-z_]+$/), entitled: z.boolean() })
  .strict();
export type SetEntitlementRequest = z.infer<typeof setEntitlementRequestSchema>;

/** The address part naming a business. */
export const platformBusinessParamsSchema = z.object({ id: z.uuid() });

/** A module that is on for the business, as the menu needs it (`GET /me`). */
export const activeModuleSchema = z.object({
  id: z.string(),
  kind: z.enum(['engine', 'channel', 'feature']),
  name: z.string(),
});
export type ActiveModule = z.infer<typeof activeModuleSchema>;
