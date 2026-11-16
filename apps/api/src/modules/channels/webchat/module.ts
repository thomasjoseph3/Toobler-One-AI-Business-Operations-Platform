import { defineModule } from '../../../kernel/module-system/define';
import { webchatSettingsRoutes } from './routes/webchat-settings.routes';

/**
 * The website chat: a chat bubble on the business's own website where the AI agent answers visitors (docs/features/F20-website-chat.md).
 * A channel module: the business switches it on and off in Settings → Modules, and while it is off its routes answer 404 and its data is
 * kept. Built in slices of at most 2 routes; each route file is registered here with one line. It only translates between a visitor's
 * browser and the conversation engine: the agent, the sorting and the summary are the core modules' (it never has logic of its own about
 * what to answer).
 */
export default defineModule({
  id: 'channel.webchat',
  kind: 'channel',
  // The chat is saved as conversations, answered by the agent, and the agent reads the business through these
  requires: ['core.auth', 'core.conversations', 'core.agents', 'core.ai'],
  routes: (app) => {
    webchatSettingsRoutes(app);
  },
});
