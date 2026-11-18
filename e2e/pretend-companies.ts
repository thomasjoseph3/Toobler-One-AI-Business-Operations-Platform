// The pretend companies for the browser tests. It answers the same calls as the real API (`GET /companies`, `POST /companies`), keeps what the page
// sent, and can be told to refuse the next company.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendCompanies {
  /** The companies the pretend API has, newest first, as the real API sends them. */
  companies: Array<Record<string, unknown>>;
  /** What the page sent to add a company. */
  postedCompanies: Array<Record<string, unknown>>;
  /** The addresses of the list calls the page made (the part after the question mark). */
  listRequests: string[];
  /** When set, the next company is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** When true, the list cannot be loaded. */
  fails: boolean;
}

/** Builds one pretend company. */
function pretendCompany(
  id: string,
  name: string,
  details: {
    domain?: string;
    city?: string;
    contactCount?: number;
    openLeads?: number;
    wonValuePaise?: number;
    ownerName?: string | null;
  },
): Record<string, unknown> {
  return {
    id,
    name,
    domain: details.domain ?? null,
    phone: null,
    city: details.city ?? null,
    owner: details.ownerName === null ? null : { userId: 'owner-1', name: details.ownerName ?? 'Anita Nair' },
    contactCount: details.contactCount ?? 0,
    openLeads: details.openLeads ?? 0,
    wonValuePaise: details.wonValuePaise ?? 0,
    createdAt: '2026-11-17T09:00:00.000Z',
    updatedAt: '2026-11-17T09:00:00.000Z',
  };
}

/** Two companies at the start of a test. */
export function startingCompanies(): PretendCompanies {
  return {
    companies: [
      pretendCompany('company-1', 'Infosys HR', {
        domain: 'infosys.com',
        city: 'Bengaluru',
        contactCount: 2,
        openLeads: 1,
        wonValuePaise: 15_000_000,
      }),
      pretendCompany('company-2', 'Nair Travels', { city: 'Kochi', ownerName: null }),
    ],
    postedCompanies: [],
    listRequests: [],
    refusal: null,
    fails: false,
  };
}

/** Answers a companies call, or undefined when it is not one. */
export function answerCompaniesCall(
  state: PretendCompanies,
  call: { method: string; path: string; search: string; body: Record<string, unknown> | null },
): PretendAnswer | undefined {
  if (call.path !== '/companies') return undefined;
  if (call.method === 'GET') {
    state.listRequests.push(call.search);
    if (state.fails) return { status: 500, body: { error: { code: 'UNKNOWN_ERROR', message: 'Down.' } } };
    const query = new URLSearchParams(call.search);
    const searchText = (query.get('q') ?? '').toLowerCase();
    const matching = state.companies.filter((company) =>
      searchText === ''
        ? true
        : [company['name'], company['domain'], company['city']].some((value) =>
            String(value ?? '')
              .toLowerCase()
              .includes(searchText),
          ),
    );
    const limit = Number(query.get('limit') ?? 25);
    const page = Number(query.get('page') ?? 1);
    return {
      status: 200,
      body: { items: matching.slice((page - 1) * limit, page * limit), total: matching.length, page, limit },
    };
  }
  if (call.method === 'POST') {
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.postedCompanies.push(call.body ?? {});
    const company = pretendCompany(`company-new-${state.postedCompanies.length}`, String(call.body?.['name']), {
      ...(typeof call.body?.['domain'] === 'string' ? { domain: call.body['domain'] } : {}),
      ...(typeof call.body?.['city'] === 'string' ? { city: call.body['city'] } : {}),
    });
    state.companies.unshift(company);
    return { status: 201, body: company };
  }
  return undefined;
}
