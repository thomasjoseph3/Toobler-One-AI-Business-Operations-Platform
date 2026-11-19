// The pretend duplicates for the browser tests. It answers the same calls as the real API (`/duplicates`), keeps what the page sent, and can be told
// to fail the list or to refuse a merge.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendDuplicates {
  /** The open pairs the list shows (each is removed when the page merges or dismisses it). */
  items: Array<Record<string, unknown>>;
  /** What the page sent to merge, by pair id. */
  merges: Array<{ id: string; body: Record<string, unknown> }>;
  /** The ids the page dismissed. */
  dismissed: string[];
  /** Whether the list fails to load. */
  listFails: boolean;
  /** When set, the next merge is refused with this status, code and message. */
  mergeRefusal: { status: number; code: string; message: string } | null;
}

const record = (extra: Record<string, unknown>) => ({
  id: 'x',
  name: null,
  phone: null,
  email: null,
  language: null,
  lifecycleStage: 'new',
  companyId: null,
  companyName: null,
  domain: null,
  city: null,
  ownerUserId: null,
  ownerName: null,
  custom: {},
  createdAt: '2026-11-10T10:00:00.000Z',
  ...extra,
});

/** One pair of contacts that look like one person. */
export function twinContacts(): Record<string, unknown> {
  return {
    id: 'pair-1',
    object: 'contact',
    reasons: ['same_name_similar_phone'],
    a: record({
      id: 'contact-a',
      name: 'Anil Kumar',
      phone: '+971501234567',
      language: 'en',
      custom: { car_model: 'Swift' },
    }),
    b: record({ id: 'contact-b', name: 'Anil Kumar', phone: '+971501234568', email: 'anil@example.com' }),
    aHasOpenLead: false,
    bHasOpenLead: false,
    createdAt: '2026-11-18T02:30:00.000Z',
  };
}

export function startingDuplicates(): PretendDuplicates {
  return { items: [], merges: [], dismissed: [], listFails: false, mergeRefusal: null };
}

/** Answers a duplicates call, or undefined when the call is not about them. */
export function answerDuplicatesCall(
  state: PretendDuplicates,
  call: { method: string; path: string; body: Record<string, unknown> | null },
): PretendAnswer | undefined {
  if (call.path === '/duplicates' && call.method === 'GET') {
    if (state.listFails)
      return { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong.' } } };
    return {
      status: 200,
      body: {
        items: state.items,
        fields: [
          {
            id: 'f1',
            object: 'contact',
            key: 'car_model',
            label: 'Car model',
            type: 'text',
            options: [],
            aiAsks: false,
            requiredForWon: false,
          },
        ],
      },
    };
  }
  const match = /^\/duplicates\/([^/]+)\/(merge|dismiss)$/.exec(call.path);
  if (match && call.method === 'POST') {
    const [, id, action] = match as unknown as [string, string, string];
    if (action === 'merge') {
      if (state.mergeRefusal) {
        const { status, code, message } = state.mergeRefusal;
        state.mergeRefusal = null;
        return { status, body: { error: { code, message } } };
      }
      state.merges.push({ id, body: call.body ?? {} });
      state.items = state.items.filter((item) => item['id'] !== id);
      return { status: 200, body: { object: 'contact', keptId: 'contact-a', mergedAwayId: 'contact-b' } };
    }
    state.dismissed.push(id);
    state.items = state.items.filter((item) => item['id'] !== id);
    return { status: 200, body: { id, status: 'dismissed' } };
  }
  return undefined;
}
