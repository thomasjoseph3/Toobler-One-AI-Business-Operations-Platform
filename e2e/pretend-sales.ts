// The pretend offerings and offers for the browser tests. It answers the same calls as the real API (`/offerings...`, `/offers...`), keeps
// what the page sent, and can be told to refuse.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendSales {
  offerings: Array<Record<string, unknown>>;
  offers: Array<Record<string, unknown>>;
  createdOfferings: Array<Record<string, unknown>>;
  patchedOfferings: Array<{ id: string; body: Record<string, unknown> }>;
  reorders: string[][];
  deletedOfferingIds: string[];
  createdOffers: Array<Record<string, unknown>>;
  patchedOffers: Array<{ id: string; body: Record<string, unknown> }>;
  deletedOfferIds: string[];
  /** The queries of every `GET /offers`, so a test can see "include=expired" was asked for. */
  offerQueries: string[];
  /** When set, the next create or change of an offering (or offer) is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** When true, `GET /offerings` fails with a server error. */
  offeringsFail: boolean;
}

const NOW = '2026-11-17T10:00:00.000Z';
const GST_WORDS: Record<string, string> = { included: 'including GST', plus: 'plus GST', none: 'with no GST' };

function offering(fields: Record<string, unknown>) {
  return {
    description: null,
    fromPricePaise: null,
    priceUnit: null,
    gstMode: null,
    priceInWords: null,
    seasonNote: null,
    includes: null,
    details: [],
    active: true,
    ownerUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...fields,
  };
}

export function startingSales(): PretendSales {
  return {
    offerings: [
      offering({
        id: '0191f0a0-0000-7000-8000-0000000000e1',
        name: 'Deluxe room',
        description: 'Sea view',
        fromPricePaise: 450000,
        priceUnit: 'per night',
        gstMode: 'plus',
        priceInWords: 'from ₹4,500 per night plus GST',
        includes: 'Breakfast',
        details: [{ label: 'Check-in', value: '2 PM' }],
        sort: 0,
      }),
      offering({ id: '0191f0a0-0000-7000-8000-0000000000e2', name: 'Yoga class', active: false, sort: 1 }),
    ],
    offers: [
      { id: '0191f0a0-0000-7000-8000-0000000000f1', text: 'December: 10% off', endsOn: '2099-12-31', current: true, createdAt: NOW, updatedAt: NOW },
      { id: '0191f0a0-0000-7000-8000-0000000000f2', text: 'Old promotion', endsOn: '2000-01-01', current: false, createdAt: NOW, updatedAt: NOW },
    ],
    createdOfferings: [],
    patchedOfferings: [],
    reorders: [],
    deletedOfferingIds: [],
    createdOffers: [],
    patchedOffers: [],
    deletedOfferIds: [],
    offerQueries: [],
    refusal: null,
    offeringsFail: false,
  };
}

const money = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/** The price in words the way the API says it. */
function priceWords(body: Record<string, unknown>): string | null {
  if (typeof body['fromPricePaise'] !== 'number') return null;
  return `from ${money(body['fromPricePaise'])} ${String(body['priceUnit'])} ${GST_WORDS[String(body['gstMode'])] ?? ''}`.trim();
}

/** Answers an `/offerings...` or `/offers...` call, or says nothing (undefined) when the call is not about them. */
export function answerSalesCall(
  sales: PretendSales,
  call: { method: string; path: string; search: string; body: Record<string, unknown> | null; role: 'manager' | 'staff' },
): PretendAnswer | undefined {
  const { method, path, search, body, role } = call;
  const refuseStaff = (): PretendAnswer => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } });
  const refused = (): PretendAnswer | undefined => {
    if (!sales.refusal) return undefined;
    const { status, code, message } = sales.refusal;
    return { status, body: { error: { code, message } } };
  };

  if (path === '/offerings' && method === 'GET') {
    if (sales.offeringsFail) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: { items: sales.offerings } };
  }
  if (path === '/offerings' && method === 'POST') {
    if (role !== 'manager') return refuseStaff();
    const refusal = refused();
    if (refusal) return refusal;
    sales.createdOfferings.push(body ?? {});
    const created = offering({
      ...(body ?? {}),
      id: `0191f0a0-0000-7000-8000-0000000000${(0xe3 + sales.createdOfferings.length - 1).toString(16)}`,
      priceInWords: priceWords(body ?? {}),
      active: body?.['active'] ?? true,
      sort: sales.offerings.length,
    });
    sales.offerings.push(created);
    return { status: 201, body: created };
  }
  if (path === '/offerings/reorder' && method === 'POST') {
    if (role !== 'manager') return refuseStaff();
    const ids = (body?.['offeringIds'] as string[]) ?? [];
    sales.reorders.push(ids);
    sales.offerings.sort((first, second) => ids.indexOf(String(first['id'])) - ids.indexOf(String(second['id'])));
    sales.offerings.forEach((item, position) => (item['sort'] = position));
    return { status: 200, body: { items: sales.offerings } };
  }
  const offeringMatch = /^\/offerings\/([^/]+)$/.exec(path);
  if (offeringMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (role !== 'manager') return refuseStaff();
    const id = offeringMatch[1]!;
    const target = sales.offerings.find((item) => item['id'] === id);
    if (!target) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That was not found.' } } };
    if (method === 'DELETE') {
      sales.deletedOfferingIds.push(id);
      sales.offerings = sales.offerings.filter((item) => item['id'] !== id);
      return { status: 204 };
    }
    const refusal = refused();
    if (refusal) return refusal;
    sales.patchedOfferings.push({ id, body: body ?? {} });
    Object.assign(target, body ?? {});
    if (body && ('fromPricePaise' in body)) {
      target['priceInWords'] = body['fromPricePaise'] === null ? null : priceWords(body);
      if (body['fromPricePaise'] === null) Object.assign(target, { priceUnit: null, gstMode: null });
    }
    return { status: 200, body: target };
  }

  if (path === '/offers' && method === 'GET') {
    sales.offerQueries.push(search);
    const includeEnded = search.includes('include=expired');
    return { status: 200, body: { items: sales.offers.filter((item) => includeEnded || item['current'] === true) } };
  }
  if (path === '/offers' && method === 'POST') {
    if (role !== 'manager') return refuseStaff();
    const refusal = refused();
    if (refusal) return refusal;
    sales.createdOffers.push(body ?? {});
    const created = { id: `0191f0a0-0000-7000-8000-0000000000${(0xf3 + sales.createdOffers.length - 1).toString(16)}`, ...(body ?? {}), current: true, createdAt: NOW, updatedAt: NOW };
    sales.offers.push(created);
    return { status: 201, body: created };
  }
  const offerMatch = /^\/offers\/([^/]+)$/.exec(path);
  if (offerMatch && (method === 'PATCH' || method === 'DELETE')) {
    if (role !== 'manager') return refuseStaff();
    const id = offerMatch[1]!;
    const target = sales.offers.find((item) => item['id'] === id);
    if (!target) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That was not found.' } } };
    if (method === 'DELETE') {
      sales.deletedOfferIds.push(id);
      sales.offers = sales.offers.filter((item) => item['id'] !== id);
      return { status: 204 };
    }
    const refusal = refused();
    if (refusal) return refusal;
    sales.patchedOffers.push({ id, body: body ?? {} });
    Object.assign(target, body ?? {});
    return { status: 200, body: target };
  }
  return undefined;
}
