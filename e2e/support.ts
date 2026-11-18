import { test as base, expect } from '@playwright/test';
import { answerFaqsCall, startingFaqs, type PretendFaqs } from './pretend-faqs';
import { answerKnowledgeCall, startingKnowledge, type PretendKnowledge } from './pretend-knowledge';
import { answerAgentCall, startingAgent, type PretendAgent } from './pretend-agent';
import { answerNotesCall, startingNotes, type PretendNotes } from './pretend-notes';
import { answerTasksCall, startingTasks, type PretendTasks } from './pretend-tasks';
import { answerTeamCall, startingTeam, type PretendTeam } from './pretend-team';
import { answerSettingsCall, startingSettings, type PretendSettings } from './pretend-settings';
import { answerWebchatCall, startingWebchat, type PretendWebchat } from './pretend-webchat';
import { answerSalesCall, startingSales, type PretendSales } from './pretend-sales';
import { answerSetupCall, startingSetup, type PretendSetup } from './pretend-setup';

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
  /** The bodies the page sent to `POST /contacts` and `POST /leads`. */
  postedContacts: Array<Record<string, unknown>>;
  postedLeads: Array<Record<string, unknown>>;
  /** When set, `POST /contacts` (or `POST /leads`) is refused with this status and code. */
  contactCreateRefusal: { status: number; code: string; message: string } | null;
  leadCreateRefusal: { status: number; code: string; message: string } | null;
  /** The signed-in person's role: a manager may delete leads, staff may not. */
  role: 'manager' | 'staff';
  /** The calls the page made to move a lead, change its owner, or delete it. */
  movedLeads: Array<{ leadId: string; body: Record<string, unknown> }>;
  assignedLeads: Array<{ leadId: string; body: Record<string, unknown> }>;
  deletedLeadIds: string[];
  /** When set, moving, assigning or deleting a lead is refused with this status and code. */
  leadActionRefusal: { status: number; code: string; message: string } | null;
  /** The edits the page sent with `PATCH /leads/{id}`, and what the pretend API holds for a lead after them. */
  patchedLeads: Array<{ leadId: string; body: Record<string, unknown> }>;
  leadEdits: Record<string, Record<string, unknown>>;
  /** Ids of leads that "do not exist" (the page gets a 404 for them). */
  missingLeadIds: string[];
  /** When set, `PATCH /leads/{id}` is refused with this status and code. */
  leadEditRefusal: { status: number; code: string; message: string } | null;
  /** The business profile (Knowledge base): questions, answers, situations, settings and the reading of the website. */
  knowledge: PretendKnowledge;
  /** The setup wizard: the steps, what the owner marked, the industry words and going live. */
  setup: PretendSetup;
  /** "Test the agent": what the page sent, and a way to make the agent refuse. */
  agent: PretendAgent;
  /** What you sell: the offerings and offers, what the page sent, and a way to make it refuse. */
  sales: PretendSales;
  /** FAQs and unanswered questions. */
  faqs: PretendFaqs;
  /** The website chat settings (Channels). */
  webchat: PretendWebchat;
  /** Settings: the AI key mode, own keys, usage and the modules. */
  settings: PretendSettings;
  /** Notes on a lead (the Notes panel and the lead page). */
  notes: PretendNotes;
  /** Tasks (the Tasks page, the lead page and the Add task form). */
  tasks: PretendTasks;
  /** The team (Settings → Team): people, invitations. */
  team: PretendTeam;
}

/** The business's lost reasons as the pretend API gives them. */
const PRETEND_LOST_REASONS = [
  { id: 'reason-1', label: 'Too costly', sort: 0 },
  { id: 'reason-2', label: 'Went elsewhere', sort: 1 },
  { id: 'reason-3', label: 'No reply', sort: 2 },
];

/** The signed-in person as the pretend API gives them, with the role a test chose. */
const profileFor = (pretendApi: { role: 'manager' | 'staff' }) => ({
  ...PRETEND_PROFILE,
  user: { ...PRETEND_PROFILE.user, role: pretendApi.role },
});

/** The people the pretend contact search can find. */
const PRETEND_CONTACTS = [
  { id: 'contact-priya', name: 'Priya Menon', phone: '+919847011201', email: 'priya.menon@example.com' },
  { id: 'contact-arjun', name: 'Arjun Nair', phone: '+919895022302', email: null },
  { id: 'contact-caller', name: null, phone: '+919847012312', email: null },
];

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
        postedContacts: [],
        postedLeads: [],
        contactCreateRefusal: null,
        leadCreateRefusal: null,
        role: 'manager',
        movedLeads: [],
        assignedLeads: [],
        deletedLeadIds: [],
        leadActionRefusal: null,
        patchedLeads: [],
        leadEdits: {},
        missingLeadIds: [],
        leadEditRefusal: null,
        knowledge: startingKnowledge(),
        setup: startingSetup(),
        agent: startingAgent(),
        sales: startingSales(),
        faqs: startingFaqs(),
        webchat: startingWebchat(),
        settings: startingSettings(),
        notes: startingNotes(),
        tasks: startingTasks(PRETEND_PROFILE.user.id, PRETEND_PROFILE.user.name),
        team: startingTeam(PRETEND_PROFILE.user.id, PRETEND_PROFILE.user.name, PRETEND_PROFILE.user.email),
      };
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace('/api/v1', '');
        pretendApi.calls.push(`${request.method()} ${path}`);
        if (pretendApi.serverDown) return route.fulfill(json(503, { error: { code: 'DOWN', message: 'Down.' } }));
        const unauthorized = json(401, { error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } });
        if (path === '/me') {
          return route.fulfill(
            pretendApi.signedIn && !pretendApi.accessExpired ? json(200, profileFor(pretendApi)) : unauthorized,
          );
        }
        if (path === '/team' || path === '/team/invitations') {
          const teamAnswer = answerTeamCall(pretendApi.team, {
            method: request.method(),
            path,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
            role: pretendApi.role,
          });
          if (teamAnswer) return route.fulfill(json(teamAnswer.status, teamAnswer.body));
        }
        if (path === '/tasks' || path.startsWith('/tasks/')) {
          const profile = profileFor(pretendApi);
          const tasksAnswer = answerTasksCall(pretendApi.tasks, {
            method: request.method(),
            path,
            search: new URL(request.url()).search,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
            userName: profile.user.name,
            userId: profile.user.id,
          });
          if (tasksAnswer) {
            return route.fulfill(
              tasksAnswer.body === undefined
                ? { status: tasksAnswer.status }
                : json(tasksAnswer.status, tasksAnswer.body),
            );
          }
        }
        if (
          path === '/activities' ||
          path === '/activities/counts' ||
          path === '/notes' ||
          path.startsWith('/notes/') ||
          /^\/contacts\/contact-\d+$/.test(path)
        ) {
          const notesAnswer = answerNotesCall(pretendApi.notes, {
            method: request.method(),
            path,
            search: new URL(request.url()).search,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
            userName: profileFor(pretendApi).user.name,
            userId: profileFor(pretendApi).user.id,
            role: pretendApi.role,
          });
          if (notesAnswer) return route.fulfill(json(notesAnswer.status, notesAnswer.body));
        }
        if (path.startsWith('/ai/') || path.startsWith('/modules')) {
          const settingsAnswer = answerSettingsCall(pretendApi.settings, {
            method: request.method(),
            path,
            body:
              request.method() === 'GET' || request.method() === 'DELETE'
                ? null
                : (request.postDataJSON() as Record<string, unknown> | null),
            role: pretendApi.role,
          });
          if (settingsAnswer) {
            return route.fulfill(
              settingsAnswer.body === undefined
                ? { status: settingsAnswer.status }
                : json(settingsAnswer.status, settingsAnswer.body),
            );
          }
        }
        if (path === '/channels/webchat') {
          const webchatAnswer = answerWebchatCall(pretendApi.webchat, {
            method: request.method(),
            path,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
            role: pretendApi.role,
          });
          if (webchatAnswer) return route.fulfill(json(webchatAnswer.status, webchatAnswer.body));
        }
        if (path.startsWith('/offerings') || path.startsWith('/offers')) {
          const salesAnswer = answerSalesCall(pretendApi.sales, {
            method: request.method(),
            path,
            search: new URL(request.url()).search,
            body:
              request.method() === 'GET' || request.method() === 'DELETE'
                ? null
                : (request.postDataJSON() as Record<string, unknown> | null),
            role: pretendApi.role,
          });
          if (salesAnswer) {
            return route.fulfill(
              salesAnswer.body === undefined
                ? { status: salesAnswer.status }
                : json(salesAnswer.status, salesAnswer.body),
            );
          }
        }
        if (path.startsWith('/agent/')) {
          const agentAnswer = answerAgentCall(pretendApi.agent, pretendApi.setup, {
            method: request.method(),
            path,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
          });
          if (agentAnswer) {
            return route.fulfill(
              agentAnswer.body === undefined
                ? { status: agentAnswer.status }
                : json(agentAnswer.status, agentAnswer.body),
            );
          }
        }
        if (path.startsWith('/setup')) {
          const setupAnswer = answerSetupCall(pretendApi.setup, pretendApi.knowledge, {
            method: request.method(),
            path,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
            role: pretendApi.role,
          });
          if (setupAnswer) {
            return route.fulfill(
              setupAnswer.body === undefined
                ? { status: setupAnswer.status }
                : json(setupAnswer.status, setupAnswer.body),
            );
          }
        }
        if (/^\/knowledge\/(faqs|unanswered|search)/.test(path)) {
          const faqsAnswer = answerFaqsCall(pretendApi.faqs, {
            method: request.method(),
            path,
            search: new URL(request.url()).search,
            body:
              request.method() === 'GET' || request.method() === 'DELETE'
                ? null
                : (request.postDataJSON() as Record<string, unknown> | null),
          });
          if (faqsAnswer) {
            return route.fulfill(
              faqsAnswer.body === undefined ? { status: faqsAnswer.status } : json(faqsAnswer.status, faqsAnswer.body),
            );
          }
        }
        if (path.startsWith('/knowledge/')) {
          const knowledgeAnswer = answerKnowledgeCall(pretendApi.knowledge, {
            method: request.method(),
            path,
            body: request.method() === 'GET' ? null : (request.postDataJSON() as Record<string, unknown> | null),
            role: pretendApi.role,
          });
          if (knowledgeAnswer) {
            return route.fulfill(
              knowledgeAnswer.body === undefined
                ? { status: knowledgeAnswer.status }
                : json(knowledgeAnswer.status, knowledgeAnswer.body),
            );
          }
        }
        if (path === '/lost-reasons') return route.fulfill(json(200, { items: PRETEND_LOST_REASONS }));
        // One lead, and editing its details
        const oneLeadMatch = /^\/leads\/(lead-(\d+))$/.exec(path);
        if (oneLeadMatch && (request.method() === 'GET' || request.method() === 'PATCH')) {
          const leadId = oneLeadMatch[1]!;
          if (pretendApi.missingLeadIds.includes(leadId)) {
            return route.fulfill(json(404, { error: { code: 'NOT_FOUND', message: 'That lead does not exist.' } }));
          }
          if (request.method() === 'PATCH') {
            if (pretendApi.leadEditRefusal) {
              const { status, code, message } = pretendApi.leadEditRefusal;
              return route.fulfill(json(status, { error: { code, message } }));
            }
            const body = request.postDataJSON() as Record<string, unknown>;
            pretendApi.patchedLeads.push({ leadId, body });
            pretendApi.leadEdits[leadId] = {
              ...(pretendApi.leadEdits[leadId] ?? {}),
              ...body,
              updatedAt: `edited-${pretendApi.patchedLeads.length}`,
            };
          }
          return route.fulfill(
            json(200, { ...pretendLead(Number(oneLeadMatch[2])), ...(pretendApi.leadEdits[leadId] ?? {}) }),
          );
        }
        const leadActionMatch = /^\/leads\/([^/]+?)(\/move|\/assign)?$/.exec(path);
        if (leadActionMatch && request.method() !== 'GET') {
          const leadId = leadActionMatch[1]!;
          const action = leadActionMatch[2];
          if (pretendApi.leadActionRefusal) {
            const { status, code, message } = pretendApi.leadActionRefusal;
            return route.fulfill(json(status, { error: { code, message } }));
          }
          if (request.method() === 'DELETE') {
            if (pretendApi.role !== 'manager') {
              return route.fulfill(json(403, { error: { code: 'FORBIDDEN', message: 'Not allowed.' } }));
            }
            pretendApi.deletedLeadIds.push(leadId);
            return route.fulfill({ status: 204 });
          }
          const body = request.postDataJSON() as Record<string, unknown>;
          (action === '/move' ? pretendApi.movedLeads : pretendApi.assignedLeads).push({ leadId, body });
          return route.fulfill(json(200, pretendLead(0)));
        }
        if (path === '/contacts' && request.method() === 'GET') {
          const searchText = (new URL(request.url()).searchParams.get('q') ?? '').toLowerCase();
          const items = PRETEND_CONTACTS.filter((contact) =>
            [contact.name, contact.phone, contact.email].some((value) => value?.toLowerCase().includes(searchText)),
          );
          return route.fulfill(json(200, { items, total: items.length, page: 1, limit: 5 }));
        }
        if (path === '/contacts' && request.method() === 'POST') {
          const body = request.postDataJSON() as Record<string, unknown>;
          pretendApi.postedContacts.push(body);
          if (pretendApi.contactCreateRefusal) {
            const { status, code, message } = pretendApi.contactCreateRefusal;
            return route.fulfill(json(status, { error: { code, message } }));
          }
          return route.fulfill(
            json(201, {
              id: 'contact-new',
              name: body.name ?? null,
              phone: body.phone ?? null,
              email: body.email ?? null,
            }),
          );
        }
        if (path === '/leads' && request.method() === 'POST') {
          const body = request.postDataJSON() as Record<string, unknown>;
          pretendApi.postedLeads.push(body);
          if (pretendApi.leadCreateRefusal) {
            const { status, code, message } = pretendApi.leadCreateRefusal;
            return route.fulfill(json(status, { error: { code, message } }));
          }
          pretendApi.leadCount += 1;
          return route.fulfill(json(201, { ...pretendLead(0), contactId: body.contactId }));
        }
        if (path === '/pipeline' || path === '/leads') {
          if (pretendApi.leadsFail) return route.fulfill(json(500, { error: { code: 'BROKEN', message: 'Broken.' } }));
          if (!pretendApi.signedIn || pretendApi.accessExpired) return route.fulfill(unauthorized);
          if (path === '/pipeline') return route.fulfill(json(200, PRETEND_PIPELINE));
          pretendApi.leadQueries.push(new URL(request.url()).search);
          const query = new URL(request.url()).searchParams;
          // The board: a column per stage; the open leads are dealt out to the three open stages, the rest of the stages are empty
          if (query.get('view') === 'board') {
            const openLeads = Array.from({ length: Math.min(pretendApi.leadCount, 50 * 3) }, (_unused, index) =>
              pretendLead(index),
            );
            const columns = PRETEND_PIPELINE.stages.map((stage) => {
              const leadsInStage = openLeads.filter((lead) => lead.stage.id === stage.id);
              const total = Array.from({ length: pretendApi.leadCount }, (_unused, index) => index).filter(
                (index) => index % 3 === PRETEND_PIPELINE.stages.findIndex((candidate) => candidate.id === stage.id),
              ).length;
              return {
                stage: { id: stage.id, name: stage.name, kind: stage.kind, sort: stage.sort },
                leadCount: stage.kind === 'open' ? total : 0,
                leads: stage.kind === 'open' ? leadsInStage.slice(0, 50) : [],
                hasMore: stage.kind === 'open' && total > 50,
              };
            });
            return route.fulfill(json(200, { view: 'board', columns }));
          }
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
          return route.fulfill(json(200, profileFor(pretendApi)));
        }
        if (path === '/auth/logout') {
          pretendApi.signedIn = false;
          return route.fulfill(json(200, { ok: true }));
        }
        if (path === '/auth/refresh') {
          if (pretendApi.refreshWorks && pretendApi.signedIn) {
            pretendApi.accessExpired = false;
            return route.fulfill(json(200, profileFor(pretendApi)));
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
