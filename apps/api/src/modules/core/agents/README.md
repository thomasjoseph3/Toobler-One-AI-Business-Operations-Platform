# core.agents: the AI agent that talks to customers in text

Built in slices (see `docs/features/F19-ai-agent-and-test-the-agent.md`). Text replies are English only.

| Folder      | What is in it                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `helpers/`  | `build-agent-prompt.ts`: the agent's instructions in a steady part (rules and the business's facts) and a changing part (time, open or closed, details so far) (pure)          |
| `helpers/`  | `choose-promise.ts`: the one promise a conversation ends with and when it falls due, chosen by code from the opening hours (pure)                                              |
| `helpers/`  | `opening-hours.ts`: is the business open now, and when does it open next, in the business's time zone (pure)                                                                   |
| `helpers/`  | `check-amounts.ts`: catches an answer that holds an amount of money no source gave, such as a total the AI worked out (pure)                                                   |

The AI states facts; code decides. The agent never picks the promise, never works out a time, and never says a total.

**What the agent may know** comes from the modules that own the data, through their `index.ts`: `findBusinessIdentity` (auth),
`findBusinessKnowledgeForTheAgent` (knowledge: confirmed answers, the seven situations, the opening hours) and `findWhatTheAgentMaySee` (offerings:
offerings that are on, offers that have not ended).
