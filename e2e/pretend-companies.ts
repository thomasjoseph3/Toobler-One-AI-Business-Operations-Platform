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
  /** The people in each company (by company id), as the company page lists them. */
  people: Record<
    string,
    Array<{ id: string; name: string | null; phone: string | null; email: string | null; lifecycleStage: string }>
  >;
  /** The leads of each company's people (by company id), as the company page lists them. */
  leads: Record<string, Array<Record<string, unknown>>>;
  /** Which company each contact is in (by contact id), so the contact page can show it. */
  contactCompany: Record<string, string | null>;
  /** What the page sent to change a company, and which companies it deleted. */
  patchedCompanies: Array<{ companyId: string; body: Record<string, unknown> }>;
  deletedCompanyIds: string[];
  /** What the page sent to put a contact in a company or take it out. */
  linkedContacts: Array<{ contactId: string; companyId: string | null }>;
}

/** The names of the people the pretend contact search can find, so a person put in a company shows under their own name. */
const KNOWN_CONTACT_NAMES: Record<string, string> = { 'contact-priya': 'Priya Menon', 'contact-arjun': 'Arjun Nair' };

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
    people: {
      'company-1': [
        {
          id: 'contact-0',
          name: 'Priya Menon 0',
          phone: '+919847010000',
          email: 'person0@infosys.com',
          lifecycleStage: 'lead',
        },
        { id: 'contact-1', name: 'Rahul Das 1', phone: null, email: 'person1@infosys.com', lifecycleStage: 'customer' },
      ],
    },
    leads: {
      'company-1': [
        {
          id: 'lead-0',
          contactId: 'contact-0',
          stageName: 'Contacted',
          stageKind: 'open',
          interest: 'Team offsite',
          budgetPaise: null,
          createdAt: '2026-11-16T08:00:00.000Z',
        },
        {
          id: 'lead-1',
          contactId: 'contact-1',
          stageName: 'Won',
          stageKind: 'won',
          interest: 'Conference hall',
          budgetPaise: 15_000_000,
          createdAt: '2026-11-10T08:00:00.000Z',
        },
      ],
    },
    contactCompany: { 'contact-0': 'company-1', 'contact-1': 'company-1' },
    patchedCompanies: [],
    deletedCompanyIds: [],
    linkedContacts: [],
  };
}

/** Answers a companies call, or undefined when it is not one. */
export function answerCompaniesCall(
  state: PretendCompanies,
  call: { method: string; path: string; search: string; body: Record<string, unknown> | null },
): PretendAnswer | undefined {
  const contactLink = /^\/contacts\/([\w-]+)\/company$/u.exec(call.path);
  if (contactLink && call.method === 'PUT') {
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    const contactId = contactLink[1]!;
    const companyId = (call.body?.['companyId'] as string | null | undefined) ?? null;
    state.linkedContacts.push({ contactId, companyId });
    // The person leaves any company they were in, and joins the new one
    let person = undefined as
      | { id: string; name: string | null; phone: string | null; email: string | null; lifecycleStage: string }
      | undefined;
    for (const [id, people] of Object.entries(state.people)) {
      person = people.find((candidate) => candidate.id === contactId) ?? person;
      state.people[id] = people.filter((candidate) => candidate.id !== contactId);
    }
    if (companyId) {
      state.people[companyId] = [
        ...(state.people[companyId] ?? []),
        person ?? {
          id: contactId,
          name: KNOWN_CONTACT_NAMES[contactId] ?? `Priya Menon ${contactId.replace('contact-', '')}`,
          phone: null,
          email: null,
          lifecycleStage: 'new',
        },
      ];
    }
    state.contactCompany[contactId] = companyId;
    return {
      status: 200,
      body: {
        id: contactId,
        name: null,
        phone: null,
        email: null,
        language: null,
        lifecycleStage: 'new',
        companyId,
        createdAt: '2026-11-10T08:00:00.000Z',
        updatedAt: '2026-11-16T09:30:00.000Z',
      },
    };
  }
  const detailMatch = /^\/companies\/([\w-]+)$/u.exec(call.path);
  if (detailMatch && (call.method === 'PATCH' || call.method === 'DELETE')) {
    const company = state.companies.find((candidate) => candidate['id'] === detailMatch[1]);
    if (!company) return { status: 404, body: { error: { code: 'NOT_FOUND', message: "That company wasn't found." } } };
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    if (call.method === 'PATCH') {
      state.patchedCompanies.push({ companyId: String(company['id']), body: call.body ?? {} });
      Object.assign(company, call.body ?? {});
      return { status: 200, body: company };
    }
    state.deletedCompanyIds.push(String(company['id']));
    state.companies = state.companies.filter((candidate) => candidate !== company);
    return { status: 204 };
  }
  if (detailMatch && call.method === 'GET') {
    if (state.fails) return { status: 500, body: { error: { code: 'UNKNOWN_ERROR', message: 'Down.' } } };
    const company = state.companies.find((candidate) => candidate['id'] === detailMatch[1]);
    if (!company) return { status: 404, body: { error: { code: 'NOT_FOUND', message: "That company wasn't found." } } };
    const people = state.people[detailMatch[1]!] ?? [];
    return {
      status: 200,
      body: {
        ...company,
        contactCount: people.length,
        contacts: people,
        leads: (state.leads[detailMatch[1]!] ?? []).filter((lead) =>
          people.some((person) => person.id === lead['contactId']),
        ),
      },
    };
  }
  if (call.path !== '/companies') return undefined;
  if (call.method === 'GET') {
    state.listRequests.push(call.search);
    if (state.fails) return { status: 500, body: { error: { code: 'UNKNOWN_ERROR', message: 'Down.' } } };
    const query = new URLSearchParams(call.search);
    const searchText = (query.get('q') ?? '').toLowerCase();
    const domain = query.get('domain');
    const matching = state.companies
      .filter((company) => (domain ? company['domain'] === domain : true))
      .filter((company) =>
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
