// The pretend AI agent for the browser tests: it answers "Test the agent" calls from a few fixed rules, keeps what the page sent, and can be told
// to refuse. Having had an answer also finishes the "Try the AI agent" setup step, as the real API does.

import type { PretendAnswer } from './pretend-knowledge';
import type { PretendSetup } from './pretend-setup';

export interface PretendAgent {
  /** What the page sent to `POST /agent/test-chat`. */
  sent: Array<{ conversationId?: string; message: string }>;
  /** Which test chats the page asked a summary for. */
  summariesAskedFor: string[];
  /** When set, the next turn is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** The details each test chat has saved so far. */
  detailsByChat: Record<string, Record<string, string>>;
  chatsStarted: number;
}

export function startingAgent(): PretendAgent {
  return { sent: [], summariesAskedFor: [], refusal: null, detailsByChat: {}, chatsStarted: 0 };
}

const chatId = (number: number) => `0191f0a0-0000-7000-8000-0000000000d${number}`;

/** Answers an `/agent/...` call, or says nothing (undefined) when the call is not about the agent. */
export function answerAgentCall(
  agent: PretendAgent,
  setup: PretendSetup,
  call: { method: string; path: string; body: Record<string, unknown> | null },
): PretendAnswer | undefined {
  const { method, path, body } = call;

  if (path === '/agent/test-chat' && method === 'POST') {
    if (agent.refusal) {
      const { status, code, message: refusalMessage } = agent.refusal;
      return { status, body: { error: { code, message: refusalMessage } } };
    }
    const message = String(body?.['message'] ?? '');
    const existingId = body?.['conversationId'] ? String(body['conversationId']) : undefined;
    agent.sent.push({ ...(existingId ? { conversationId: existingId } : {}), message });
    let conversationId = existingId;
    if (!conversationId) {
      agent.chatsStarted += 1;
      conversationId = chatId(agent.chatsStarted);
    }
    const details = (agent.detailsByChat[conversationId] ??= {});
    setup.triedTheAgent = true;
    const text = message.toLowerCase();

    if (text.includes('price') || text.includes('cost')) {
      return {
        status: 200,
        body: {
          conversationId,
          reply: 'A deluxe room is from ₹4,000 a night plus GST.',
          answeredFrom: [
            { kind: 'offerings', label: 'Offerings and offers' },
            { kind: 'offerings', label: 'Offerings and offers' },
          ],
          toolsCalled: [{ name: 'list_offerings', ok: true, input: {} }],
          detailsSaved: details,
          situation: 'sale_enquiry',
          promise: null,
          heldBackAmounts: [],
        },
      };
    }
    if (text.includes('98470')) {
      Object.assign(details, { Name: 'Ravi', Phone: '98470 12345' });
      return {
        status: 200,
        body: {
          conversationId,
          reply: 'Thank you, Ravi. Our team will call you within 15 minutes.',
          answeredFrom: [],
          toolsCalled: [
            { name: 'save_details', ok: true, input: { name: 'Ravi' } },
            { name: 'something_new', ok: false, input: {} },
          ],
          detailsSaved: details,
          situation: 'sale_enquiry',
          promise: { kind: 'call_back_open', sentence: 'Our team will call you within 15 minutes.', dueAt: '2026-11-17T10:15:00.000Z' },
          heldBackAmounts: [],
        },
      };
    }
    if (text.includes('total')) {
      return {
        status: 200,
        body: {
          conversationId,
          reply: 'A deluxe room is from ₹4,000 a night plus GST. Our team will confirm the total.',
          answeredFrom: [{ kind: 'faq', label: 'Do you have parking?' }],
          toolsCalled: [],
          detailsSaved: details,
          situation: 'sale_enquiry',
          promise: null,
          heldBackAmounts: [12000],
        },
      };
    }
    return {
      status: 200,
      body: {
        conversationId,
        reply: 'Hello! How can I help you today?',
        answeredFrom: [],
        toolsCalled: [],
        detailsSaved: details,
        situation: 'sale_enquiry',
        promise: null,
        heldBackAmounts: [],
      },
    };
  }

  const summaryMatch = /^\/agent\/test-chats\/([^/]+)\/summary$/.exec(path);
  if (summaryMatch && method === 'POST') {
    agent.summariesAskedFor.push(summaryMatch[1]!);
    return {
      status: 200,
      body: { conversationId: summaryMatch[1], summary: 'Ravi asked about a deluxe room and was promised a call within 15 minutes.', summarisedAt: '2026-11-17T10:05:00.000Z', writtenByAi: true },
    };
  }
  return undefined;
}
