import type { AgentAnswerSource } from '@toobler-one/shared';
import type { LlmToolCallRecord } from '../../../../providers/llm';

// Says where an answer came from, in words, from the tools the agent used. Pure: no database.

/** The question lines of a search result ("Question: Do you have parking?"), which are the FAQs the answer was found in. */
function findQuestionsInSearchResult(result: string): string[] {
  return result
    .split('\n')
    .filter((line) => line.startsWith('Question: '))
    .map((line) => line.slice('Question: '.length).trim());
}

/** The places the agent looked at to answer, without repeats, in the order it looked. Only tools that worked count. */
export function describeAnswerSources(toolCalls: readonly LlmToolCallRecord[]): AgentAnswerSource[] {
  const sources: AgentAnswerSource[] = [];
  const addOnce = (source: AgentAnswerSource) => {
    if (!sources.some((existing) => existing.kind === source.kind && existing.label === source.label))
      sources.push(source);
  };
  for (const call of toolCalls) {
    if (!call.ok) continue;
    if (call.toolName === 'list_offerings') addOnce({ kind: 'offerings', label: 'Offerings and offers' });
    if (call.toolName === 'get_business_info') addOnce({ kind: 'business_info', label: 'Business profile' });
    if (call.toolName === 'search_knowledge') {
      for (const question of findQuestionsInSearchResult(call.result)) addOnce({ kind: 'faq', label: question });
    }
  }
  return sources;
}
