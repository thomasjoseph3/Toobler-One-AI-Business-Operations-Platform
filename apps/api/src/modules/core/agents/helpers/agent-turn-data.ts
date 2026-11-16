import type { WeeklyHoursValue } from '@toobler-one/shared';
import type { BusinessKnowledgeForTheAgent } from '../../knowledge';
import type { WhatTheAgentMaySee } from '../../offerings';
import type { AgentConversationState, PromiseContext } from './agent-conversation-state';

// What the agent's tools share during one turn (one customer message and the reply to it). Types only.

/** Everything the agent may know, read once at the start of the turn. */
export interface AgentTurnData {
  businessName: string;
  timeZone: string;
  knowledge: BusinessKnowledgeForTheAgent;
  whatWeSell: WhatTheAgentMaySee;
  now: Date;
}

/** The conversation's state, held in one place so every tool of the turn sees the same one and the runtime can read it at the end. */
export interface StateHolder {
  current: AgentConversationState;
}

/** The facts the promise is chosen from, taken from what the turn read. */
export function promiseContextOf(data: AgentTurnData): PromiseContext {
  const weeklyHours: WeeklyHoursValue | undefined = data.knowledge.weeklyHours;
  return { now: data.now, timeZone: data.timeZone, weeklyHours };
}
