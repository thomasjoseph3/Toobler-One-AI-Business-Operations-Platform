import { defineModule } from '../../../kernel/module-system/define';

/**
 * The AI agent that talks to customers in text (F19): its prompt, its tools, the promise it ends with, and the checks on what it says.
 * A core module: always on, so it has no switch. The channels (web chat, WhatsApp, email) call it through `index.ts`; it never calls a
 * channel. Built in slices (docs/features/F19-ai-agent-and-test-the-agent.md): this slice has only pure helpers, so it registers no routes.
 */
export default defineModule({
  id: 'core.agents',
  kind: 'core',
  // It reads the business (auth), what the business told it (knowledge), what it sells (offerings), writes down conversations
  // (conversations) and asks the AI for replies (ai)
  requires: ['core.auth', 'core.knowledge', 'core.offerings', 'core.conversations', 'core.ai'],
});
