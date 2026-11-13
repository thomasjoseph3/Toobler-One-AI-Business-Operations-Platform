import { test as base, expect } from '@playwright/test';

/** The person the pretend API signs in. */
export const PRETEND_PROFILE = {
  user: {
    id: '0191f0a0-0000-7000-8000-000000000001',
    name: 'Anita Nair',
    email: 'anita@example.com',
    mobile: '+919847012345',
    role: 'manager',
    emailVerified: true,
  },
  business: {
    id: '0191f0a0-0000-7000-8000-000000000002',
    name: 'Nair Stays',
    industry: 'hotel_resort',
    timeZone: 'Asia/Kolkata',
  },
};

/** A pretend API for browser tests: a few settings a test can change, and a list of the calls the page made. */
export interface PretendApi {
  /** Whether a person is signed in right now (the page starts out signed in, like a returning visitor). */
  signedIn: boolean;
  /** The 15-minute access token has run out: calls get 401 until the page refreshes. */
  accessExpired: boolean;
  /** Whether the refresh works (false = the session has ended for good). */
  refreshWorks: boolean;
  /** When set, sign-in is refused with this status and code. */
  signInRefusal: { status: number; code: string; message: string } | null;
  /** When true, every call fails with a server error (the server is down). */
  serverDown: boolean;
  /** Every call the page made, as "METHOD /path". */
  calls: string[];
  /** The headers of the last sign-in call. */
  lastSignInHeaders: Record<string, string>;
  /** How many open leads the pretend API has in all (it serves them 25 to a page). */
  leadCount: number;
  /** When true, the leads calls fail with a server error (the rest of the app still works). */
  leadsFail: boolean;
  /** The query part (`?status=open&...`) of every `GET /leads` the page made, so a test can see what was asked for. */
  leadQueries: string[];
}

/** The ids of the pretend stages (real-looking ids, because the page only accepts ids of that shape in the address). */
export const PRETEND_STAGE_IDS = {
  new: '0191f0a0-0000-7000-8000-0000000000a1',
  contacted: '0191f0a0-0000-7000-8000-0000000000a2',
  quoted: '0191f0a0-0000-7000-8000-0000000000a3',
  won: '0191f0a0-0000-7000-8000-0000000000a4',
  lost: '0191f0a0-0000-7000-8000-0000000000a5',
};

/** The business's pipeline as the pretend API gives it: three open stages, then Won and Lost. */
const PRETEND_PIPELINE = {
  id: 'pipeline-1',
  name: 'Sales',
  stages: [
    { id: PRETEND_STAGE_IDS.new, name: 'New', kind: 'open', sort: 0, leadCount: 0 },
    { id: PRETEND_STAGE_IDS.contacted, name: 'Contacted', kind: 'open', sort: 1, leadCount: 0 },
    { id: PRETEND_STAGE_IDS.quoted, name: 'Quoted', kind: 'open', sort: 2, leadCount: 0 },
    { id: PRETEND_STAGE_IDS.won, name: 'Won', kind: 'won', sort: 3, leadCount: 0 },
    { id: PRETEND_STAGE_IDS.lost, name: 'Lost', kind: 'lost', sort: 4, leadCount: 0 },
  ],
};

/**
 * The open lead at this place in the list. They come in three shapes, repeating, so a test can see all the display rules:
 * a named person with a callback and the signed-in person as owner; a caller with only a phone and an owner who is someone else;
 * a person with only an email and no owner.
 */
function pretendLead(index: number) {
  const shape = index % 3;
  const stageNames = ['New', 'Contacted', 'Quoted'];
  const stageIds = [PRETEND_STAGE_IDS.new, PRETEND_STAGE_IDS.contacted, PRETEND_STAGE_IDS.quoted];
  const channels = ['whatsapp', 'web_chat', 'email'];
  return {
    id: `lead-${index}`,
    contactId: `contact-${index}`,
    contact: {
      id: `contact-${index}`,
      name: shape === 0 ? `Priya Menon ${index}` : null,
      phone: shape === 2 ? null : `+9198470${String(10000 + index)}`,
      email: shape === 1 ? null : `person${index}@example.com`,
    },
    stage: { id: stageIds[shape], name: stageNames[shape], kind: 'open' },
    temperature: 'unscored',
    interest: null,
    dateFrom: null,
    dateTo: null,
    partySize: null,
    budgetPaise: null,
    promise: null,
    // 22 Nov 10:00 UTC is 22 Nov in India too
    callbackAt: shape === 0 ? '2026-11-22T10:00:00.000Z' : null,
    ownerUserId: shape === 0 ? PRETEND_PROFILE.user.id : shape === 1 ? 'someone-else' : null,
    offering: null,
    firstChannel: channels[shape],
    lastActivityAt: '2026-11-13T09:00:00.000Z',
    lostReason: null,
    closedAt: null,
    createdAt: '2026-11-13T09:00:00.000Z',
    updatedAt: '2026-11-13T09:00:00.000Z',
  };
}

/** Answers a call with a JSON body. */
const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

// Every test fails if the page writes an error to the browser console or throws: the cheapest way to catch real breakage.
// The browser also writes "Failed to load resource" for every 4xx/5xx answer; tests that make the pretend API refuse on
// purpose would trip on that, so those lines are ignored (the page code itself must still be silent).
export const test = base.extend<{ consoleProblems: string[]; pretendApi: PretendApi }>({
  pretendApi: [
    async ({ page }, use) => {
      const pretendApi: PretendApi = {
        signedIn: true,
        accessExpired: false,
        refreshWorks: true,
        signInRefusal: null,
        serverDown: false,
        calls: [],
        lastSignInHeaders: {},
        leadCount: 3,
        leadsFail: false,
        leadQueries: [],
      };
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace('/api/v1', '');
        pretendApi.calls.push(`${request.method()} ${path}`);
        if (pretendApi.serverDown) return route.fulfill(json(503, { error: { code: 'DOWN', message: 'Down.' } }));
        const unauthorized = json(401, { error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } });
        if (path === '/me') {
          return route.fulfill(
            pretendApi.signedIn && !pretendApi.accessExpired ? json(200, PRETEND_PROFILE) : unauthorized,
          );
        }
        if (path === '/pipeline' || path === '/leads') {
          if (pretendApi.leadsFail) return route.fulfill(json(500, { error: { code: 'BROKEN', message: 'Broken.' } }));
          if (!pretendApi.signedIn || pretendApi.accessExpired) return route.fulfill(unauthorized);
          if (path === '/pipeline') return route.fulfill(json(200, PRETEND_PIPELINE));
          pretendApi.leadQueries.push(new URL(request.url()).search);
          const query = new URL(request.url()).searchParams;
          const pageNumber = Number(query.get('page') ?? '1');
          const limit = Number(query.get('limit') ?? '25');
          const firstIndex = (pageNumber - 1) * limit;
          const lastIndex = Math.min(firstIndex + limit, pretendApi.leadCount);
          const items = [];
          for (let index = firstIndex; index < lastIndex; index += 1) items.push(pretendLead(index));
          return route.fulfill(
            json(200, { view: 'list', items, total: pretendApi.leadCount, page: pageNumber, limit }),
          );
        }
        if (path === '/auth/login') {
          pretendApi.lastSignInHeaders = request.headers();
          if (pretendApi.signInRefusal) {
            const { status, code, message } = pretendApi.signInRefusal;
            return route.fulfill(json(status, { error: { code, message } }));
          }
          pretendApi.signedIn = true;
          pretendApi.accessExpired = false;
          return route.fulfill(json(200, PRETEND_PROFILE));
        }
        if (path === '/auth/logout') {
          pretendApi.signedIn = false;
          return route.fulfill(json(200, { ok: true }));
        }
        if (path === '/auth/refresh') {
          if (pretendApi.refreshWorks && pretendApi.signedIn) {
            pretendApi.accessExpired = false;
            return route.fulfill(json(200, PRETEND_PROFILE));
          }
          pretendApi.signedIn = false;
          return route.fulfill(json(401, { error: { code: 'SESSION_ENDED', message: 'Your session has ended.' } }));
        }
        return route.fulfill(json(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } }));
      });
      await use(pretendApi);
    },
    { auto: true },
  ],
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
          problems.push(`console error: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`));
      await use(problems);
      expect(problems, 'the page wrote errors to the console').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** The pages of the staff app: the menu text and the address of each. */
export const PAGES = [
  { label: 'Today', path: '/', isInPhoneBar: true },
  { label: 'Leads', path: '/leads', isInPhoneBar: true },
  { label: 'Contacts', path: '/contacts', isInPhoneBar: false },
  { label: 'Companies', path: '/companies', isInPhoneBar: false },
  { label: 'Inbox', path: '/inbox', isInPhoneBar: true },
  { label: 'Tasks', path: '/tasks', isInPhoneBar: true },
  { label: 'Tickets', path: '/tickets', isInPhoneBar: false },
  { label: 'Reports', path: '/reports', isInPhoneBar: false },
  { label: 'Knowledge base', path: '/knowledge', isInPhoneBar: false },
  { label: 'Channels', path: '/channels', isInPhoneBar: false },
  { label: 'Settings', path: '/settings', isInPhoneBar: false },
] as const;
