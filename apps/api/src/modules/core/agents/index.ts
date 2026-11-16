// The public face of the agents module: the only file other modules may import from it.
// The channels (F20 onward) and "Test the agent" call the agent through this file; it knows no channel.
export { createAgentRuntime, COULD_NOT_WORK_IT_OUT_REPLY } from './services/agent-runtime.service';
export type { AgentRuntimeDependencies, AgentTurnInput, AgentTurnResult } from './services/agent-runtime.service';
export { EMPTY_AGENT_CONVERSATION_STATE } from './helpers/agent-conversation-state';
export type { AgentConversationState } from './helpers/agent-conversation-state';
export { AGENT_PROMPT_VERSION, buildAgentPrompt } from './helpers/build-agent-prompt';
export type { AgentPromptInput, DetailsSoFar } from './helpers/build-agent-prompt';
export { chooseThePromise, DEFAULT_CALLBACK_MINUTES } from './helpers/choose-promise';
export type { ChosenPromise, PromiseKind, PromiseSituation } from './helpers/choose-promise';
export { findUnbackedAmounts, UNCONFIRMED_AMOUNT_REPLY } from './helpers/check-amounts';
