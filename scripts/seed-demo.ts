// npm run db:seed:demo
// npm run db:seed:demo -- --allow-remote     (needed when DATABASE_URL is not on this computer)
//
// Adds ONE demo business, "Demo: Nair Stays", with a manager login, contacts, leads in every stage, tickets, offerings and
// FAQs, so the screens have something real to show. It does everything through the app's own routes (the same ones the web
// app uses), so every rule applies and nothing is written behind the app's back.
//
// Safety: it changes the database that DATABASE_URL points to. It refuses to run on a database that is not on this computer
// unless you add --allow-remote, which you do on purpose. It can be run again safely: it adds only what is missing, so an interrupted run can be finished and nothing is added twice.
// Every demo email ends in @demo.toobler.example and the business name starts with "Demo:", so the rows are easy to find.
import { buildApp } from '../apps/api/src/app';
import { loadConfig, loadEnvFile } from '../apps/api/src/kernel/config';
import { createDatabase } from '../apps/api/src/kernel/database';
import { createRegistry } from '../apps/api/src/kernel/module-system/registry';
import { modules } from '../apps/api/src/modules';
import type { MailSender } from '../apps/api/src/providers/mail/mail-sender';

const DEMO_EMAIL = 'manager@demo.toobler.example';
const DEMO_PASSWORD = 'river-lamp-kettle-42';
const DEMO_BUSINESS_NAME = 'Demo: Nair Stays';

loadEnvFile();
process.env.LOG_LEVEL = 'warn'; // the app logs every request; a script only needs to hear about problems
const config = loadConfig();
const databaseAddress = new URL(config.db.url);
const isLocalDatabase = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(databaseAddress.hostname);

console.log(`Database: ${databaseAddress.hostname}${databaseAddress.pathname}`);
if (!isLocalDatabase && !process.argv.includes('--allow-remote')) {
  console.log('This database is not on this computer, so nothing was added.');
  console.log(
    'If you are sure it is your development database, run again with: npm run db:seed:demo -- --allow-remote',
  );
  process.exit(1);
}

const database = createDatabase(config.db);
await database.ping();

// Nothing here sends a real email: the sign-up email is thrown away.
const throwAwayMailSender: MailSender = { send: async () => undefined };
const app = await buildApp({
  config,
  database,
  registry: createRegistry(modules),
  healthChecks: [],
  mailSender: throwAwayMailSender,
  strictRouteLimits: false,
  rateLimit: { max: 100_000, timeWindow: '1 minute' },
});

/** The headers the web app adds to every request that changes something (the app refuses changes without them). */
const unsafeHeaders = { origin: config.webUrl, 'x-requested-with': 'toobler-web' };

let accessCookie = '';

/** Sends one request to the app as the demo manager and returns the answer's JSON. Stops the script unless the app answers with a 2xx. */
async function send<Answer = { id: string }>(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: unknown,
): Promise<Answer> {
  const response = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...unsafeHeaders, ...(accessCookie ? { cookie: accessCookie } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  if (response.statusCode < 200 || response.statusCode > 299) {
    throw new Error(`${method} ${url} answered ${response.statusCode}: ${response.body}`);
  }
  return (response.body ? response.json() : undefined) as Answer;
}

/** A date `daysFromNow` days away, as a plain date like 2026-12-20. */
const plainDate = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

/** A moment `hoursFromNow` hours away, as UTC text (a callback time). */
const momentInHours = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();

try {
  // 1. The business and its manager: the real sign-up route (only when the demo login does not exist yet), then the email
  // is marked verified (what the email link does) and the manager signs in.
  const existing = await database.system
    .selectFrom('users')
    .select('id')
    .where('email', '=', DEMO_EMAIL)
    .executeTakeFirst();
  if (!existing) {
    await send('POST', '/auth/signup', {
      name: 'Anita Nair',
      businessName: DEMO_BUSINESS_NAME,
      email: DEMO_EMAIL,
      mobile: '+91 98470 12345',
      password: DEMO_PASSWORD,
      industry: 'hotel_resort',
    });
    await database.system
      .updateTable('users')
      .set({ email_verified_at: new Date() })
      .where('email', '=', DEMO_EMAIL)
      .execute();
  }
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: unsafeHeaders,
    payload: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  if (login.statusCode !== 200) throw new Error(`Sign-in answered ${login.statusCode}`);
  accessCookie = `toobler_access=${login.cookies.find((cookie) => cookie.name === 'toobler_access')?.value ?? ''}`;
  let added = 0;

  // 2. Contacts: a mix of people with a name and a phone, an email only, and an unknown caller with only a phone
  const people = [
    { name: 'Priya Menon', phone: '+91 98470 11201', email: 'priya.menon@example.com' },
    { name: 'Arjun Nair', phone: '+91 98950 22302' },
    { name: 'Fatima Rahman', phone: '+91 94470 33403', email: 'fatima.rahman@example.com' },
    { name: 'Joseph Thomas', phone: '+91 99610 44504' },
    { name: 'Lakshmi Iyer', phone: '+91 98460 55605', email: 'lakshmi.iyer@example.com' },
    { name: 'Rahul Verma', phone: '+91 98110 66706' },
    { name: 'Anjali Das', phone: '+91 90480 77807', email: 'anjali.das@example.com' },
    { name: 'Mohammed Salim', phone: '+91 97460 88908' },
    { name: 'Sneha Pillai', phone: '+91 98470 99109', email: 'sneha.pillai@example.com' },
    { name: 'Vikram Singh', phone: '+91 98260 10210' },
    { name: 'Deepa Kurian', email: 'deepa.kurian@example.com' }, // email only
    { phone: '+91 98470 12312' }, // an unknown caller: no name yet
  ];
  const existingContacts = (
    await send<{ items: Array<{ id: string; phone: string | null; email: string | null }> }>(
      'GET',
      '/contacts?limit=100',
    )
  ).items;
  const contactIds: string[] = [];
  for (const person of people) {
    // A contact is already there when its phone (stored without spaces) or its email matches
    const alreadyThere = existingContacts.find(
      (contact) =>
        (person.phone && contact.phone === person.phone.replace(/\s/g, '')) ||
        (person.email && contact.email === person.email),
    );
    if (alreadyThere) {
      contactIds.push(alreadyThere.id);
      continue;
    }
    contactIds.push((await send('POST', '/contacts', person)).id);
    added += 1;
  }

  // 3. Leads in every stage. The pipeline's own stage ids are looked up, never guessed.
  const pipeline = await send<{ stages: Array<{ id: string; name: string }> }>('GET', '/pipeline');
  const stageIdNamed = (name: string): string => {
    const stage = pipeline.stages.find((candidate) => candidate.name === name);
    if (!stage) throw new Error(`The pipeline has no stage called ${name}`);
    return stage.id;
  };
  const leads: Array<{
    contactIndex: number;
    interest: string;
    stage: string;
    dateFrom?: string;
    dateTo?: string;
    partySize?: number;
    budgetPaise?: number;
    callbackInHours?: number;
    lostReason?: string;
  }> = [
    {
      contactIndex: 0,
      interest: 'Family room for 3 nights over Christmas',
      stage: 'New',
      dateFrom: plainDate(40),
      dateTo: plainDate(43),
      partySize: 4,
      budgetPaise: 3_600_000,
      callbackInHours: 6,
    },
    {
      contactIndex: 1,
      interest: 'Two rooms for a wedding party, 2 nights',
      stage: 'Contacted',
      dateFrom: plainDate(60),
      dateTo: plainDate(62),
      partySize: 8,
      budgetPaise: 9_000_000,
      callbackInHours: 30,
    },
    {
      contactIndex: 2,
      interest: 'Quiet room with a lake view, weekend',
      stage: 'Quoted',
      dateFrom: plainDate(21),
      dateTo: plainDate(23),
      partySize: 2,
      budgetPaise: 1_800_000,
      callbackInHours: 52,
    },
    { contactIndex: 3, interest: 'Airport pickup and a night stay', stage: 'New' },
    {
      contactIndex: 4,
      interest: 'Anniversary stay, wants a surprise cake',
      stage: 'Contacted',
      dateFrom: plainDate(14),
      dateTo: plainDate(16),
      partySize: 2,
      callbackInHours: 3,
    },
    {
      contactIndex: 5,
      interest: 'Corporate stay, 5 rooms, 4 nights',
      stage: 'Quoted',
      dateFrom: plainDate(35),
      dateTo: plainDate(39),
      partySize: 5,
      budgetPaise: 18_000_000,
    },
    {
      contactIndex: 6,
      interest: 'Honeymoon package',
      stage: 'Won',
      dateFrom: plainDate(28),
      dateTo: plainDate(31),
      partySize: 2,
      budgetPaise: 4_500_000,
    },
    {
      contactIndex: 7,
      interest: 'Group of 12 for a conference',
      stage: 'Lost',
      partySize: 12,
      lostReason: 'Too costly',
    },
    { contactIndex: 8, interest: 'Pet-friendly room, 2 nights', stage: 'New', callbackInHours: 20 },
    { contactIndex: 11, interest: 'Asked about room rates on a call', stage: 'New' },
  ];
  type LeadAnswer = { id: string; contactId: string; stage: { name: string } };
  const existingLeads = (await send<{ items: LeadAnswer[] }>('GET', '/leads?limit=100')).items;
  for (const lead of leads) {
    let current = existingLeads.find((existingLead) => existingLead.contactId === contactIds[lead.contactIndex]);
    if (!current) {
      current = await send<LeadAnswer>('POST', '/leads', {
        contactId: contactIds[lead.contactIndex],
        interest: lead.interest,
        ...(lead.dateFrom ? { dateFrom: lead.dateFrom } : {}),
        ...(lead.dateTo ? { dateTo: lead.dateTo } : {}),
        ...(lead.partySize ? { partySize: lead.partySize } : {}),
        ...(lead.budgetPaise ? { budgetPaise: lead.budgetPaise } : {}),
        ...(lead.callbackInHours ? { callbackAt: momentInHours(lead.callbackInHours) } : {}),
      });
      added += 1;
    }
    // A lead whose move was interrupted in an earlier run is moved now
    if (current && lead.stage !== 'New' && current.stage.name !== lead.stage) {
      await send('POST', `/leads/${current.id}/move`, {
        stageId: stageIdNamed(lead.stage),
        ...(lead.lostReason ? { lostReason: lead.lostReason } : {}),
      });
    }
  }

  // 4. Tickets: a complaint, a callback and a question, for people who are not buying right now
  const tickets = [
    {
      contactId: contactIds[9],
      title: 'Air conditioner was not cooling in room 204',
      details: 'The guest says it was warm all night and asked for a call from the manager.',
      type: 'complaint',
      priority: 'high',
    },
    {
      contactId: contactIds[10],
      title: 'Please call back about the booking invoice',
      type: 'callback',
      priority: 'normal',
    },
    {
      contactId: contactIds[4],
      title: 'Can we change check-in to the evening?',
      details: 'Asked whether a late check-in at 9 PM is possible.',
      type: 'question',
      priority: 'low',
    },
  ];
  const existingTicketTitles = new Set<string>(
    (await send<{ items: Array<{ title: string }> }>('GET', '/tickets?limit=100')).items.map((ticket) => ticket.title),
  );
  for (const ticket of tickets) {
    if (existingTicketTitles.has(ticket.title)) continue;
    await send('POST', '/tickets', ticket);
    added += 1;
  }

  // 5. Offerings and FAQs, so the knowledge base is not empty
  const offerings = [
    {
      name: 'Deluxe room',
      description: 'Air-conditioned room with a balcony and breakfast for two.',
      fromPricePaise: 450_000,
      priceUnit: 'per night',
      gstMode: 'plus',
    },
    {
      name: 'Family suite',
      description: 'Two bedrooms and a living area, sleeps up to six.',
      fromPricePaise: 720_000,
      priceUnit: 'per night',
      gstMode: 'plus',
    },
    {
      name: 'Airport pickup',
      description: 'Pickup from the airport in a sedan, up to four guests.',
      fromPricePaise: 120_000,
      priceUnit: 'per trip',
      gstMode: 'none',
    },
  ];
  const existingOfferingNames = new Set<string>(
    (await send<{ items: Array<{ name: string }> }>('GET', '/offerings')).items.map((offering) => offering.name),
  );
  for (const offering of offerings) {
    if (existingOfferingNames.has(offering.name)) continue;
    await send('POST', '/offerings', offering);
    added += 1;
  }
  const faqs = [
    {
      question: 'What time is check-in and check-out?',
      answer:
        'Check-in is from 2 PM and check-out is by 11 AM. Early check-in and late check-out depend on availability.',
    },
    {
      question: 'Is parking available?',
      answer: 'Yes, free parking is available for up to 15 cars inside the property.',
    },
    {
      question: 'Are pets allowed?',
      answer: 'Small pets are welcome in ground-floor rooms. Please tell us in advance.',
    },
    {
      question: 'Is breakfast included?',
      answer: 'Breakfast for two is included with the Deluxe room and the Family suite.',
    },
  ];
  const existingFaqQuestions = new Set<string>(
    (await send<{ items: Array<{ question: string }> }>('GET', '/knowledge/faqs')).items.map((faq) => faq.question),
  );
  for (const faq of faqs) {
    if (existingFaqQuestions.has(faq.question)) continue;
    await send('POST', '/knowledge/faqs', faq);
    added += 1;
  }

  console.log(
    added === 0
      ? 'The demo business was already complete. Nothing was added.'
      : `Demo data ready: ${added} items added.`,
  );
  console.log(`  Sign in at the web app with: ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(
    `  It holds ${people.length} contacts, ${leads.length} leads, ${tickets.length} tickets, ${offerings.length} offerings and ${faqs.length} FAQs.`,
  );
} finally {
  await app.close();
  await database.close();
}
