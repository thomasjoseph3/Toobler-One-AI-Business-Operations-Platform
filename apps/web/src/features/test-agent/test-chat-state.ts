import type { AgentAnswerSource, AgentPromise, AgentTestChatResponse } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

// What the Test the agent page needs to decide. Pure: no screen, no network.

export interface ChatLine {
  sender: 'customer' | 'agent';
  body: string;
}

/** The words for each thing the agent can do during a turn. A tool this list does not know is shown by its own name, never hidden. */
const TOOL_WORDS: Readonly<Record<string, MessageKey>> = {
  get_business_info: 'testAgent.tool.get_business_info',
  list_offerings: 'testAgent.tool.list_offerings',
  search_knowledge: 'testAgent.tool.search_knowledge',
  log_unanswered_question: 'testAgent.tool.log_unanswered_question',
  save_details: 'testAgent.tool.save_details',
  request_human_callback: 'testAgent.tool.request_human_callback',
};

/** The message key for what a tool does, or null for a tool we have no words for. */
export function findToolWords(toolName: string): MessageKey | null {
  return TOOL_WORDS[toolName] ?? null;
}

/** Adds a line to the chat. */
export function addLine(lines: readonly ChatLine[], line: ChatLine): ChatLine[] {
  return [...lines, line];
}

/** Takes the last line off (used when a message could not be sent, so it can be typed again). Returns the lines and the text taken off. */
export function takeBackLastLine(lines: readonly ChatLine[]): { lines: ChatLine[]; text: string } {
  const last = lines[lines.length - 1];
  if (!last || last.sender !== 'customer') return { lines: [...lines], text: '' };
  return { lines: lines.slice(0, -1), text: last.body };
}

/** The time a callback falls due, in the business's own time zone, like "10:45 on 17 Nov". */
export function formatDueTime(isoText: string, timeZone: string): string {
  const due = new Date(isoText);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(due);
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(due);
  return `${time} on ${day}`;
}

/** The promise as the owner reads it: what the customer was told, and when it falls due (if it has a time). */
export function describePromise(promise: AgentPromise, timeZone: string): { sentence: string; due: string | null } {
  return { sentence: promise.sentence, due: promise.dueAt ? formatDueTime(promise.dueAt, timeZone) : null };
}

/** What the customer has told the agent, as pairs in the order they were saved. */
export function listDetails(detailsSaved: Readonly<Record<string, string>>): Array<{ label: string; value: string }> {
  return Object.entries(detailsSaved).map(([label, value]) => ({ label, value }));
}

/** Sources in the order given, each once (the same FAQ twice would only say the same thing twice). */
export function uniqueSources(sources: readonly AgentAnswerSource[]): AgentAnswerSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}:${source.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Whether the agent's turn needs the owner's attention: it held back an amount nobody confirmed. */
export function hasHeldBackAmounts(response: Pick<AgentTestChatResponse, 'heldBackAmounts'>): boolean {
  return response.heldBackAmounts.length > 0;
}

/** Whether a message may be sent: some words, not too long. */
export function canSendMessage(text: string, maximumLength: number): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= maximumLength;
}
