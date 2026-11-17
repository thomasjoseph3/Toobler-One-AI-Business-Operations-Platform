// The pretend FAQs and unanswered questions for the browser tests. It answers the same calls as the real API (`/knowledge/faqs`,
// `/knowledge/unanswered`, `/knowledge/search`), keeps what the page sent, and can be told to refuse.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendFaqs {
  faqs: Array<Record<string, unknown>>;
  unanswered: Array<Record<string, unknown>>;
  createdFaqs: Array<Record<string, unknown>>;
  patchedFaqs: Array<{ id: string; body: Record<string, unknown> }>;
  deletedFaqIds: string[];
  answered: Array<{ id: string; body: Record<string, unknown> }>;
  dismissedIds: string[];
  searches: string[];
  /** The queries of every `GET /knowledge/unanswered`, so a test can see "include=history" was asked for. */
  unansweredQueries: string[];
  /** When set, the next create, change or answer is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  faqsFail: boolean;
}

const NOW = '2026-11-17T10:00:00.000Z';

export function startingFaqs(): PretendFaqs {
  return {
    faqs: [
      { id: '0191f0a0-0000-7000-8000-000000000a01', question: 'Do you have parking?', answer: 'Yes, free parking for guests.', status: 'confirmed', source: 'typed', createdAt: NOW, updatedAt: NOW },
      { id: '0191f0a0-0000-7000-8000-000000000a02', question: 'Do you allow pets?', answer: 'Small pets are welcome.\nPlease tell us first.', status: 'check', source: 'website', createdAt: NOW, updatedAt: NOW },
    ],
    unanswered: [
      { id: '0191f0a0-0000-7000-8000-000000000b01', question: 'Do you have a swimming pool?', count: 1, lastAskedAt: NOW, status: 'open', faqId: null, createdAt: NOW },
      { id: '0191f0a0-0000-7000-8000-000000000b02', question: 'Is there an EV charger?', count: 3, lastAskedAt: '2026-11-16T20:00:00.000Z', status: 'open', faqId: null, createdAt: NOW },
      { id: '0191f0a0-0000-7000-8000-000000000b03', question: 'Do you take Amex?', count: 2, lastAskedAt: NOW, status: 'answered', faqId: '0191f0a0-0000-7000-8000-000000000a01', createdAt: NOW },
      { id: '0191f0a0-0000-7000-8000-000000000b04', question: 'Can I bring a drone?', count: 1, lastAskedAt: NOW, status: 'ignored', faqId: null, createdAt: NOW },
    ],
    createdFaqs: [],
    patchedFaqs: [],
    deletedFaqIds: [],
    answered: [],
    dismissedIds: [],
    searches: [],
    unansweredQueries: [],
    refusal: null,
    faqsFail: false,
  };
}

const tidy = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').trim();

export function answerFaqsCall(
  state: PretendFaqs,
  call: { method: string; path: string; search: string; body: Record<string, unknown> | null },
): PretendAnswer | undefined {
  const { method, path, search, body } = call;
  const refused = (): PretendAnswer | undefined => {
    if (!state.refusal) return undefined;
    const { status, code, message } = state.refusal;
    return { status, body: { error: { code, message } } };
  };
  const notFound = (): PretendAnswer => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'That was not found.' } } });

  if (path === '/knowledge/faqs' && method === 'GET') {
    if (state.faqsFail) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: { items: state.faqs } };
  }
  if (path === '/knowledge/faqs' && method === 'POST') {
    const refusal = refused();
    if (refusal) return refusal;
    state.createdFaqs.push(body ?? {});
    const created = { id: `0191f0a0-0000-7000-8000-000000000a${(0x10 + state.createdFaqs.length).toString(16)}`, ...(body ?? {}), status: 'confirmed', source: 'typed', createdAt: NOW, updatedAt: NOW };
    state.faqs.unshift(created);
    return { status: 201, body: created };
  }
  const faqMatch = /^\/knowledge\/faqs\/([^/]+)$/.exec(path);
  if (faqMatch && (method === 'PATCH' || method === 'DELETE')) {
    const target = state.faqs.find((item) => item['id'] === faqMatch[1]);
    if (!target) return notFound();
    if (method === 'DELETE') {
      state.deletedFaqIds.push(String(target['id']));
      state.faqs = state.faqs.filter((item) => item !== target);
      return { status: 204 };
    }
    const refusal = refused();
    if (refusal) return refusal;
    state.patchedFaqs.push({ id: String(target['id']), body: body ?? {} });
    Object.assign(target, body ?? {}, { status: 'confirmed' });
    return { status: 200, body: target };
  }

  if (path === '/knowledge/unanswered' && method === 'GET') {
    state.unansweredQueries.push(search);
    const includeHistory = search.includes('include=history');
    return { status: 200, body: { items: state.unanswered.filter((item) => includeHistory || item['status'] === 'open') } };
  }
  const answerMatch = /^\/knowledge\/unanswered\/([^/]+)\/(answer|dismiss)$/.exec(path);
  if (answerMatch && method === 'POST') {
    const target = state.unanswered.find((item) => item['id'] === answerMatch[1]);
    if (!target) return notFound();
    if (target['status'] !== 'open') return { status: 409, body: { error: { code: 'UNANSWERED_QUESTION_NOT_OPEN', message: 'This question has already been answered or ignored.' } } };
    if (answerMatch[2] === 'dismiss') {
      state.dismissedIds.push(String(target['id']));
      target['status'] = 'ignored';
      return { status: 200, body: target };
    }
    const refusal = refused();
    if (refusal) return refusal;
    state.answered.push({ id: String(target['id']), body: body ?? {} });
    const faq = { id: `0191f0a0-0000-7000-8000-000000000a${(0x20 + state.answered.length).toString(16)}`, question: tidy(body?.['question'] ?? target['question']), answer: String(body?.['answer'] ?? ''), status: 'confirmed', source: 'unanswered', createdAt: NOW, updatedAt: NOW };
    state.faqs.unshift(faq);
    target['status'] = 'answered';
    target['faqId'] = faq.id;
    return { status: 200, body: faq };
  }

  if (path === '/knowledge/search' && method === 'GET') {
    const query = new URLSearchParams(search).get('q') ?? '';
    state.searches.push(query);
    const words = query.toLowerCase();
    const items = state.faqs
      .filter((item) => item['status'] === 'confirmed' && words.split(/\s+/).some((word) => word.length > 3 && String(item['question']).toLowerCase().includes(word)))
      .map((item) => ({ sourceKind: 'faq', sourceId: item['id'], question: item['question'], answer: item['answer'], score: 1 }));
    return { status: 200, body: { items } };
  }
  return undefined;
}
