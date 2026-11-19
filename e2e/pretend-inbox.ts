// The pretend inbox for the browser tests. It answers the same calls as the real API (`/conversations`, `/conversations/{id}/...`, `/conversation-types`
// and the `/events` stream), keeps what the page sent, and can be told to fail or refuse.

import { PRETEND_PROFILE } from './support';
import type { PretendAnswer } from './pretend-knowledge';

export interface PretendInbox {
  /** The conversations the list shows. Each has the shape of an inbox item. */
  items: Array<Record<string, unknown>>;
  /** The detail of each conversation, by id. */
  details: Record<string, Record<string, unknown>>;
  /** The queries the page asked the list with. */
  queries: string[];
  /** What the page sent: the ids it took over, handed back, marked done, and the replies and type changes. */
  takeovers: string[];
  handbacks: string[];
  dones: string[];
  replies: Array<{ id: string; body: string }>;
  typeChanges: Array<{ id: string; typeKey: string }>;
  listFails: boolean;
  /** When set, the next takeover is refused with this status, code and message. */
  takeoverRefusal: { status: number; code: string; message: string } | null;
}

export function startingInbox(): PretendInbox {
  return {
    items: [],
    details: {},
    queries: [],
    takeovers: [],
    handbacks: [],
    dones: [],
    replies: [],
    typeChanges: [],
    listFails: false,
    takeoverRefusal: null,
  };
}

/** One row of the inbox. */
export function inboxItem(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'conversation-1',
    channel: 'webchat',
    contact: null,
    fromPhone: null,
    fromEmail: null,
    preview: 'Do you have a hall for 200 guests?',
    type: null,
    aiUnsure: false,
    needsPerson: false,
    heldBy: null,
    doneAt: null,
    ended: false,
    lastActivityAt: '2026-11-18T10:00:00.000Z',
    createdAt: '2026-11-18T09:50:00.000Z',
    ...extra,
  };
}

/** The detail of a conversation. */
export function conversationDetail(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'conversation-1',
    channel: 'webchat',
    fromPhone: null,
    fromEmail: null,
    contact: null,
    status: 'open',
    type: null,
    needsPerson: false,
    heldBy: null,
    heldUntil: null,
    doneAt: null,
    endedAt: null,
    sortedAt: null,
    createdAt: '2026-11-18T09:50:00.000Z',
    messages: [
      {
        id: 'm1',
        sender: 'customer',
        byUser: null,
        body: 'Do you have a hall for 200 guests?',
        createdAt: '2026-11-18T09:50:00.000Z',
      },
      {
        id: 'm2',
        sender: 'agent',
        byUser: null,
        body: 'Yes, our main hall seats 250.',
        createdAt: '2026-11-18T09:50:10.000Z',
      },
    ],
    outcomes: [],
    ...extra,
  };
}

/** The pretend signed-in person as a holder (read when needed: the support file and this one import each other). */
const me = () => ({ userId: PRETEND_PROFILE.user.id, name: PRETEND_PROFILE.user.name });

/** Answers an inbox call, or undefined when the call is not about the inbox. */
export function answerInboxCall(
  state: PretendInbox,
  call: { method: string; path: string; search: URLSearchParams; body: Record<string, unknown> | null },
): (PretendAnswer & { stream?: string }) | undefined {
  if (call.path === '/events' && call.method === 'GET') {
    return { status: 200, body: null, stream: 'retry: 500\n\n: open\n\n' };
  }
  if (call.path === '/conversation-types' && call.method === 'GET') {
    const type = (key: string, label: string) => ({ id: key, key, label, isActive: true });
    return { status: 200, body: { items: [type('new_enquiry', 'New enquiry'), type('complaint', 'Complaint')] } };
  }
  if (call.path === '/conversations' && call.method === 'GET' && call.search.get('filtered') !== 'true') {
    if (state.listFails)
      return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong.' } } };
    state.queries.push(call.search.toString());
    const items = state.items.filter((item) => {
      if (call.search.get('status') === 'done' ? item['doneAt'] === null : item['doneAt'] !== null) return false;
      const channel = call.search.get('channel');
      if (channel && item['channel'] !== channel) return false;
      if (call.search.get('needs_person') === 'true' && item['needsPerson'] !== true) return false;
      if (call.search.get('held') === 'me' && (item['heldBy'] as { userId?: string } | null)?.userId !== me().userId)
        return false;
      return true;
    });
    return { status: 200, body: { items, total: items.length, page: 1, limit: 25 } };
  }
  const match = /^\/conversations\/([^/]+)(?:\/(takeover|handback|reply|done|type))?$/.exec(call.path);
  if (!match) return undefined;
  const [, id, action] = match as unknown as [string, string, string | undefined];
  const detail = state.details[id];
  if (!detail)
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That conversation wasn’t found.' } } };
  if (call.method === 'GET' && action === undefined) return { status: 200, body: detail };
  if (call.method !== 'POST') return undefined;
  if (action === 'takeover') {
    if (state.takeoverRefusal) {
      const { status, code, message } = state.takeoverRefusal;
      state.takeoverRefusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.takeovers.push(id);
    state.details[id] = { ...detail, heldBy: me(), heldUntil: '2026-11-18T12:00:00.000Z' };
  } else if (action === 'handback') {
    state.handbacks.push(id);
    state.details[id] = { ...detail, heldBy: null, heldUntil: null };
  } else if (action === 'done') {
    state.dones.push(id);
    state.details[id] = { ...detail, heldBy: null, heldUntil: null, doneAt: '2026-11-18T11:00:00.000Z' };
  } else if (action === 'type') {
    state.typeChanges.push({ id, typeKey: String(call.body?.['typeKey']) });
    return { status: 200, body: detail };
  } else if (action === 'reply') {
    const body = String(call.body?.['body']);
    state.replies.push({ id, body });
    const message = {
      id: `reply-${state.replies.length}`,
      sender: 'staff',
      byUser: { id: me().userId, name: me().name },
      body,
      createdAt: '2026-11-18T10:05:00.000Z',
    };
    state.details[id] = { ...detail, messages: [...(detail['messages'] as unknown[]), message] };
    return { status: 201, body: message };
  }
  return { status: 200, body: state.details[id] };
}
