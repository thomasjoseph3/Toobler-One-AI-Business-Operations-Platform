// The public face of the agents module: the only file other modules may import from it.
// The channels (F20 onward) will call the agent through this file. For now it shows the pure parts the agent is built from.
export { AGENT_PROMPT_VERSION, buildAgentPrompt } from './helpers/build-agent-prompt';
export type { AgentPromptInput, DetailsSoFar } from './helpers/build-agent-prompt';
export { chooseThePromise, DEFAULT_CALLBACK_MINUTES } from './helpers/choose-promise';
export type { ChosenPromise, PromiseKind, PromiseSituation } from './helpers/choose-promise';
export { findUnbackedAmounts, UNCONFIRMED_AMOUNT_REPLY } from './helpers/check-amounts';
