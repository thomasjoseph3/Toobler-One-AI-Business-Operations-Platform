import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, type SignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

/** Sends a request as the person (or as nobody), with the headers the web app sends. */
const send = (
  person: SignedInPerson | null,
  method: 'GET' | 'PUT' | 'POST',
  url: string,
  payload?: unknown,
  withCsrf = true,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: { ...(withCsrf ? unsafeRequestHeaders : {}), ...(person ? { cookie: person.cookieHeader } : {}) },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** Reads the questions as the person. */
const getQuestions = (person: SignedInPerson | null) => send(person, 'GET', '/knowledge/questions');

/** Answers one question as the person. */
const putAnswer = (person: SignedInPerson | null, questionKey: string, value: unknown, withCsrf = true) =>
  send(person, 'PUT', `/knowledge/answers/${questionKey}`, { value }, withCsrf);

/** Makes the person the given role (their role is read from the database on every request). */
async function setRole(person: SignedInPerson, role: 'manager' | 'staff' | 'staff_own') {
  await database.system.updateTable('users').set({ role }).where('id', '=', person.profile.user.id).execute();
}

/** Changes the kind of business (the industry is read from the database on every request). */
async function setIndustry(person: SignedInPerson, industryId: string) {
  await database.system
    .updateTable('accounts')
    .set({ industry: industryId })
    .where('id', '=', person.profile.business.id)
    .execute();
}

/** The keys of the questions in an answer, in order. */
const keysOf = (body: { questions: Array<{ key: string }> }) => body.questions.map((question) => question.key);

/** The seven questions needed to go live that can be answered in the profile, with good answers. */
const GOOD_ANSWERS_NEEDED_TO_GO_LIVE: Record<string, unknown> = {
  has_website: { yes: true, detail: 'https://nairstays.example' },
  business_name: 'Nair Stays',
  business_summary: 'A homestay with six rooms near the beach.',
  address: 'Beach Road, opposite the lighthouse',
  contact_details: { rows: [{ kind: 'Phone', value: '+91 98470 12345' }] },
  opening_hours: { allDay: true },
  customer_languages: { choices: ['English', 'Malayalam'] },
};

describe('GET /api/v1/knowledge/questions', () => {
  it('gives a new hotel the general questions then the hotel extras, all unanswered, with zero progress', async () => {
    const person = await createSignedInPerson(app, database); // sign-up makes it a hotel_resort
    const response = await getQuestions(person);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.questions).toHaveLength(26 + 6);
    expect(keysOf(body).slice(0, 3)).toEqual(['has_website', 'online_profiles', 'brochure_upload']);
    expect(keysOf(body).slice(-2)).toEqual(['hotel_parking', 'hotel_nearby_places']);
    expect(body.questions.every((question: { answer: unknown }) => question.answer === null)).toBe(true);
    expect(body.progress).toMatchObject({
      answeredQuestions: 0,
      waitingForCheck: 0,
      percentComplete: 0,
      readyToGoLive: false,
      neededToGoLiveStillMissing: Object.keys(GOOD_ANSWERS_NEEDED_TO_GO_LIVE),
    });
    expect(body.progress.totalQuestions).toBe(32 - 4);
  });

  it('describes each question fully: type, options, columns, hints', async () => {
    const person = await createSignedInPerson(app, database);
    const body = (await getQuestions(person)).json();
    const byKey = (key: string) => body.questions.find((question: { key: string }) => question.key === key);
    expect(byKey('business_name')).toMatchObject({
      section: 'B',
      type: 'short_text',
      options: null,
      yesDetail: null,
      rowFields: null,
      neededToGoLive: true,
      handledElsewhere: null,
    });
    expect(byKey('payment_methods')).toMatchObject({
      type: 'pick_several',
      options: ['UPI', 'Card', 'Cash', 'Bank transfer'],
    });
    expect(byKey('usual_customers').allowOther).toBe(true);
    expect(byKey('top_priorities').maxChoices).toBe(2);
    expect(byKey('has_website').yesDetail).toEqual({ kind: 'link', required: true, label: 'Your website link' });
    expect(byKey('contact_details').rowFields.map((field: { key: string }) => field.key)).toEqual(['kind', 'value']);
    expect(byKey('contact_details').maxRows).toBe(10);
    expect(byKey('offerings')).toMatchObject({ handledElsewhere: 'offerings', neededToGoLive: true });
    expect(byKey('competitors').usedFor).toMatch(/competitor report/i);
  });

  it("follows the business's industry: another industry gets its own extras, an industry with none gets only the general ones", async () => {
    const person = await createSignedInPerson(app, database);
    await setIndustry(person, 'clinic');
    const clinic = (await getQuestions(person)).json();
    expect(keysOf(clinic).filter((key) => key.startsWith('clinic_'))).toHaveLength(4);
    expect(keysOf(clinic).some((key) => key.startsWith('hotel_'))).toBe(false);
    await setIndustry(person, 'salon_spa');
    expect((await getQuestions(person)).json().questions).toHaveLength(26);
    await setIndustry(person, 'general');
    expect((await getQuestions(person)).json().questions).toHaveLength(26);
  });

  it('shows the business its own answers, and another business none of them', async () => {
    const person = await createSignedInPerson(app, database);
    const stranger = await createSignedInPerson(app, database);
    await putAnswer(person, 'business_name', 'Nair Stays');
    const own = (await getQuestions(person))
      .json()
      .questions.find((question: { key: string }) => question.key === 'business_name');
    expect(own.answer).toMatchObject({ value: 'Nair Stays', source: 'typed', status: 'confirmed' });
    const theirs = (await getQuestions(stranger))
      .json()
      .questions.find((question: { key: string }) => question.key === 'business_name');
    expect(theirs.answer).toBeNull();
    expect(JSON.stringify((await getQuestions(stranger)).json())).not.toContain('Nair Stays');
  });

  it('lets every role read it', async () => {
    const person = await createSignedInPerson(app, database);
    for (const role of ['staff', 'staff_own', 'manager'] as const) {
      await setRole(person, role);
      expect((await getQuestions(person)).statusCode, role).toBe(200);
    }
  });

  it('answers 401 with nobody signed in', async () => {
    expect((await getQuestions(null)).statusCode).toBe(401);
  });
});

describe('PUT /api/v1/knowledge/answers/{question_key}', () => {
  it('saves a typed answer, confirmed at once, and shows it with the new progress', async () => {
    const person = await createSignedInPerson(app, database);
    const response = await putAnswer(person, 'business_name', '  Nair Stays  ');
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.question).toMatchObject({ key: 'business_name', type: 'short_text' });
    expect(body.question.answer).toMatchObject({ value: 'Nair Stays', source: 'typed', status: 'confirmed' });
    expect(body.question.answer.confirmedAt).not.toBeNull();
    expect(body.progress).toMatchObject({ answeredQuestions: 1, readyToGoLive: false });
    expect(body.progress.neededToGoLiveStillMissing).not.toContain('business_name');
    const row = await database.system
      .selectFrom('business_answers')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(row.confirmed_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.created_by).toEqual({ kind: 'user', id: person.profile.user.id });
  });

  it('changes an answer and keeps one row per question', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswer(person, 'business_name', 'Nair Stays');
    const changed = await putAnswer(person, 'business_name', 'Nair Beach Stay');
    expect(changed.json().question.answer.value).toBe('Nair Beach Stay');
    const rows = await database.system
      .selectFrom('business_answers')
      .select('question_key')
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('stores every kind of answer in the shape its question needs, and reads it back the same', async () => {
    const person = await createSignedInPerson(app, database);
    const answers: Record<string, unknown> = {
      ...GOOD_ANSWERS_NEEDED_TO_GO_LIVE,
      payment_methods: { choices: ['UPI', 'Cash'] },
      prices_include_gst: { choice: 'Plus GST' },
      usual_customers: { choices: ['Families', 'Other'], otherText: 'Pilgrims' },
      opening_hours: { days: { mon: { open: '09:00', close: '21:00' }, sun: { open: '10:00', close: '14:00' } } },
      seasonal_prices: { yes: true, detail: 'Higher in Dec to Jan' },
      competitors: { rows: [{ link: 'https://rival.example' }] },
      gst_number: '32abcde1234f1z5',
      hotel_room_types: { rows: [{ name: 'Deluxe', details: 'Sea view' }] },
      hotel_pets: { yes: false },
    };
    for (const [key, value] of Object.entries(answers)) {
      const response = await putAnswer(person, key, value);
      expect(response.statusCode, `${key}: ${response.body}`).toBe(200);
    }
    const body = (await getQuestions(person)).json();
    const valueOf = (key: string) =>
      body.questions.find((question: { key: string }) => question.key === key).answer.value;
    expect(valueOf('opening_hours')).toEqual(answers.opening_hours);
    expect(valueOf('contact_details')).toEqual(answers.contact_details);
    expect(valueOf('gst_number')).toBe('32ABCDE1234F1Z5');
    expect(valueOf('usual_customers')).toEqual(answers.usual_customers);
    expect(valueOf('hotel_pets')).toEqual({ yes: false });
    expect(body.progress.answeredQuestions).toBe(Object.keys(answers).length);
  });

  it('is ready to go live once every needed question is answered, and not before', async () => {
    const person = await createSignedInPerson(app, database);
    const entries = Object.entries(GOOD_ANSWERS_NEEDED_TO_GO_LIVE);
    let last;
    for (const [index, [key, value]] of entries.entries()) {
      last = (await putAnswer(person, key, value)).json();
      expect(last.progress.readyToGoLive, `after ${key}`).toBe(index === entries.length - 1);
    }
    expect(last.progress.neededToGoLiveStillMissing).toEqual([]);
    expect(last.progress.percentComplete).toBeGreaterThan(0);
  });

  it('writes one activity-log line with only the question key, and a knowledge.answer_saved event with no answer', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswer(person, 'address', 'Secret Lane 12, behind the old mill');
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'knowledge.answer_saved')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ record_type: 'business_answer', fields: ['address'] });
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'knowledge.answer_saved')
      .execute();
    expect(events.map((event) => event.payload)).toEqual([{ questionKey: 'address' }]);
    expect(JSON.stringify([lines, events])).not.toContain('Secret Lane');
  });

  it('writes nothing when the same answer is sent again, even with the keys in another order', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswer(person, 'has_website', { yes: true, detail: 'https://nairstays.example' });
    const again = await putAnswer(person, 'has_website', { detail: 'https://nairstays.example', yes: true });
    expect(again.statusCode, again.body).toBe(200);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'knowledge.answer_saved')
      .execute();
    expect(lines).toHaveLength(1);
  });

  it('confirms an answer that was waiting for a check when a manager types it again', async () => {
    const person = await createSignedInPerson(app, database);
    // The system will fill answers in from a website later (F31); here one is put in by hand to show the rule
    await database.system
      .insertInto('business_answers')
      .values({
        account_id: person.profile.business.id,
        question_key: 'business_name',
        value: JSON.stringify('Nair Stays (from the website)'),
        source: 'website',
        status: 'check',
      })
      .execute();
    const waiting = (await getQuestions(person)).json();
    expect(waiting.progress).toMatchObject({ answeredQuestions: 0, waitingForCheck: 1 });
    const typed = await putAnswer(person, 'business_name', 'Nair Stays (from the website)');
    expect(typed.json().question.answer).toMatchObject({ source: 'typed', status: 'confirmed' });
    expect(typed.json().progress).toMatchObject({ answeredQuestions: 1, waitingForCheck: 0 });
  });

  it('answers 403 to staff and to the "own leads only" role, and saves nothing', async () => {
    const person = await createSignedInPerson(app, database);
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await putAnswer(person, 'business_name', 'Nair Stays')).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect((await getQuestions(person)).json().progress.answeredQuestions).toBe(0);
  });

  it('answers 401 with nobody signed in and 403 without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await putAnswer(null, 'business_name', 'Nair Stays')).statusCode).toBe(401);
    expect((await putAnswer(person, 'business_name', 'Nair Stays', false)).statusCode).toBe(403);
    expect((await getQuestions(person)).json().progress.answeredQuestions).toBe(0);
  });

  it("answers 404 for a key that is not a question, and for another industry's extra question", async () => {
    const person = await createSignedInPerson(app, database); // a hotel
    expect((await putAnswer(person, 'no_such_question', 'x')).statusCode).toBe(404);
    expect((await putAnswer(person, 'clinic_insurance', { yes: true })).statusCode).toBe(404);
    expect((await putAnswer(person, 'hotel_pets', { yes: true })).statusCode).toBe(200);
    await setIndustry(person, 'clinic');
    expect((await putAnswer(person, 'hotel_pets', { yes: true })).statusCode).toBe(404);
    expect((await putAnswer(person, 'clinic_insurance', { yes: true })).statusCode).toBe(200);
  });

  it('answers 400 INVALID_ANSWER, in plain words, for a value the question does not accept', async () => {
    const person = await createSignedInPerson(app, database);
    const bad: Array<[string, unknown, RegExp]> = [
      ['business_name', '   ', /type an answer/i],
      ['business_name', 42, /./],
      ['has_website', { yes: true }, /needed/i],
      ['has_website', { yes: true, detail: 'not a link' }, /full link/i],
      ['prices_include_gst', { choice: 'Maybe' }, /pick one of/i],
      ['payment_methods', { choices: ['Bitcoin'] }, /not one of/i],
      [
        'top_priorities',
        { choices: ['Call back faster', 'Know which leads are hot', 'Answer every enquiry'] },
        /at most 2/i,
      ],
      ['opening_hours', { days: { mon: { open: '21:00', close: '09:00' } } }, /after opening/i],
      ['gst_number', '12345', /15 characters/i],
      ['contact_details', { rows: [] }, /at least one row/i],
      ['clinic_consultation_fee', { paise: 1.5 }, /./],
    ];
    await setIndustry(person, 'clinic');
    for (const [key, value, message] of bad) {
      const response = await putAnswer(person, key, value);
      expect(response.statusCode, `${key}: ${response.body}`).toBe(400);
      expect(response.json().error.code).toBe('INVALID_ANSWER');
      expect(response.json().error.message, key).toMatch(message);
    }
    expect((await getQuestions(person)).json().progress.answeredQuestions).toBe(0);
  });

  it('answers 400 for a question that is answered in another feature, and says where', async () => {
    const person = await createSignedInPerson(app, database);
    for (const [key, where] of [
      ['offerings', 'offerings'],
      ['common_questions', 'faqs'],
      ['brochure_upload', 'documents'],
    ] as const) {
      const response = await putAnswer(person, key, { rows: [{ name: 'x' }] });
      expect(response.statusCode, key).toBe(400);
      expect(response.json().error.message).toMatch(new RegExp(`answered in ${where}`, 'i'));
    }
  });

  it('answers 400 for a body without a value, with fields it does not take, and a key of the wrong shape', async () => {
    const person = await createSignedInPerson(app, database);
    const headers = { ...unsafeRequestHeaders, cookie: person.cookieHeader };
    const putRaw = (url: string, payload: unknown) =>
      app.inject({ method: 'PUT', url: `/api/v1${url}`, headers, payload: payload as object });
    expect((await putRaw('/knowledge/answers/business_name', {})).statusCode).toBe(400);
    expect((await putRaw('/knowledge/answers/business_name', { value: 'x', status: 'check' })).statusCode).toBe(400);
    expect((await putRaw('/knowledge/answers/business_name', { value: 'x', accountId: randomUUID() })).statusCode).toBe(
      400,
    );
    expect((await putRaw('/knowledge/answers/Business-Name', { value: 'x' })).statusCode).toBe(400);
    expect((await putRaw(`/knowledge/answers/${'a'.repeat(61)}`, { value: 'x' })).statusCode).toBe(400);
  });

  it('keeps businesses apart: the same question answered by two businesses gives two answers', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await putAnswer(first, 'business_name', 'First Stays');
    await putAnswer(second, 'business_name', 'Second Stays');
    const nameOf = async (person: SignedInPerson) =>
      (await getQuestions(person))
        .json()
        .questions.find((question: { key: string }) => question.key === 'business_name').answer.value;
    expect(await nameOf(first)).toBe('First Stays');
    expect(await nameOf(second)).toBe('Second Stays');
  });

  it('has a database rule that a confirmed answer has a confirmation time', async () => {
    const person = await createSignedInPerson(app, database);
    await expect(
      database.system
        .insertInto('business_answers')
        .values({
          account_id: person.profile.business.id,
          question_key: 'business_name',
          value: JSON.stringify('x'),
          status: 'confirmed',
        })
        .execute(),
    ).rejects.toThrow();
  });
});

/** Confirms answers as the person. */
const confirmAnswers = (person: SignedInPerson | null, questionKeys: unknown, withCsrf = true) =>
  send(person, 'POST', '/knowledge/answers/confirm', { questionKeys }, withCsrf);

/** Puts in an answer the way the system will fill one in from a website (F31): waiting for a manager's check. */
async function putAnswerWaitingForCheck(person: SignedInPerson, questionKey: string, value: unknown) {
  await database.system
    .insertInto('business_answers')
    .values({
      account_id: person.profile.business.id,
      question_key: questionKey,
      value: JSON.stringify(value),
      source: 'website',
      source_ref: 'https://nairstays.example',
      status: 'check',
    })
    .execute();
}

/** The status of one answer as the person reads it, or null when it is not answered. */
async function statusOf(person: SignedInPerson, questionKey: string): Promise<string | null> {
  const body = (await getQuestions(person)).json();
  return body.questions.find((question: { key: string }) => question.key === questionKey).answer?.status ?? null;
}

describe('POST /api/v1/knowledge/answers/confirm', () => {
  it('confirms answers that are waiting for a check, one or many, and moves the progress', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    await putAnswerWaitingForCheck(person, 'address', 'Beach Road');
    await putAnswerWaitingForCheck(person, 'business_summary', 'A homestay');
    expect((await getQuestions(person)).json().progress).toMatchObject({ answeredQuestions: 0, waitingForCheck: 3 });

    const one = await confirmAnswers(person, ['business_name']);
    expect(one.statusCode, one.body).toBe(200);
    expect(one.json().confirmed).toEqual(['business_name']);
    expect(one.json().progress).toMatchObject({ answeredQuestions: 1, waitingForCheck: 2 });

    const many = await confirmAnswers(person, ['address', 'business_summary']);
    expect(many.json().confirmed.sort()).toEqual(['address', 'business_summary']);
    expect(many.json().progress).toMatchObject({ answeredQuestions: 3, waitingForCheck: 0 });
  });

  it('keeps where the answer came from, and records who confirmed it and when', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    await confirmAnswers(person, ['business_name']);
    const row = await database.system
      .selectFrom('business_answers')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'confirmed', source: 'website', source_ref: 'https://nairstays.example' });
    expect(row.confirmed_by).toEqual({ kind: 'user', id: person.profile.user.id });
    expect(row.confirmed_at).not.toBeNull();
    const question = (await getQuestions(person))
      .json()
      .questions.find((candidate: { key: string }) => candidate.key === 'business_name');
    expect(question.answer).toMatchObject({ value: 'Nair Stays', source: 'website', status: 'confirmed' });
  });

  it('leaves an answer that is already confirmed as it is, and says nothing was confirmed', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswer(person, 'business_name', 'Nair Stays');
    const response = await confirmAnswers(person, ['business_name']);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().confirmed).toEqual([]);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('id')
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'knowledge.answers_confirmed')
      .execute();
    expect(lines).toHaveLength(0);
  });

  it('counts a key sent twice once', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    const response = await confirmAnswers(person, ['business_name', 'business_name']);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().confirmed).toEqual(['business_name']);
  });

  it('writes one log line with the question keys only and one event with no answer words', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'address', 'Secret Lane 12');
    await putAnswerWaitingForCheck(person, 'business_name', 'Secret Name');
    await confirmAnswers(person, ['address', 'business_name']);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('kind', '=', 'knowledge.answers_confirmed')
      .execute();
    expect(lines).toHaveLength(1);
    expect([...lines[0]!.fields].sort()).toEqual(['address', 'business_name']);
    const events = await database.system
      .selectFrom('domain_events')
      .selectAll()
      .where('account_id', '=', person.profile.business.id)
      .where('name', '=', 'knowledge.answers_confirmed')
      .execute();
    expect(events).toHaveLength(1);
    expect(JSON.stringify([lines, events])).not.toContain('Secret');
  });

  it('is all or none: one unknown question, or one with no answer, confirms nothing and answers 404', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    expect((await confirmAnswers(person, ['business_name', 'no_such_question'])).statusCode).toBe(404);
    expect((await confirmAnswers(person, ['business_name', 'address'])).statusCode).toBe(404); // no answer to address yet
    expect(await statusOf(person, 'business_name')).toBe('check');
  });

  it("answers 404 for another industry's extra question", async () => {
    const person = await createSignedInPerson(app, database); // a hotel
    await putAnswerWaitingForCheck(person, 'clinic_insurance', { yes: true });
    expect((await confirmAnswers(person, ['clinic_insurance'])).statusCode).toBe(404);
  });

  it('answers 403 to staff and to the "own leads only" role, and confirms nothing', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    for (const role of ['staff', 'staff_own'] as const) {
      await setRole(person, role);
      expect((await confirmAnswers(person, ['business_name'])).statusCode, role).toBe(403);
    }
    await setRole(person, 'manager');
    expect(await statusOf(person, 'business_name')).toBe('check');
  });

  it('answers 401 with nobody signed in and 403 without the web app headers', async () => {
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    expect((await confirmAnswers(null, ['business_name'])).statusCode).toBe(401);
    expect((await confirmAnswers(person, ['business_name'], false)).statusCode).toBe(403);
    expect(await statusOf(person, 'business_name')).toBe('check');
  });

  it('answers 400 for no keys, too many keys, a key of the wrong shape, a body that is not a list, and fields it does not take', async () => {
    const person = await createSignedInPerson(app, database);
    expect((await confirmAnswers(person, [])).statusCode).toBe(400);
    expect(
      (
        await confirmAnswers(
          person,
          Array.from({ length: 101 }, (_, index) => `question_${index}`),
        )
      ).statusCode,
    ).toBe(400);
    expect((await confirmAnswers(person, ['Business-Name'])).statusCode).toBe(400);
    expect((await confirmAnswers(person, 'business_name')).statusCode).toBe(400);
    expect((await confirmAnswers(person, [42])).statusCode).toBe(400);
    expect((await send(person, 'POST', '/knowledge/answers/confirm', {})).statusCode).toBe(400);
    expect(
      (await send(person, 'POST', '/knowledge/answers/confirm', { questionKeys: ['business_name'], all: true }))
        .statusCode,
    ).toBe(400);
  });

  it('keeps businesses apart: confirming in one business does not touch the same question in another', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(first, 'business_name', 'First Stays');
    await putAnswerWaitingForCheck(second, 'business_name', 'Second Stays');
    await confirmAnswers(first, ['business_name']);
    expect(await statusOf(first, 'business_name')).toBe('confirmed');
    expect(await statusOf(second, 'business_name')).toBe('check');
  });

  it("never lets an answer that is waiting for a check reach the AI's view of the business", async () => {
    const { onlyConfirmedAnswers } = await import('../src/modules/core/knowledge/helpers/usable-answers');
    const person = await createSignedInPerson(app, database);
    await putAnswerWaitingForCheck(person, 'business_name', 'Nair Stays');
    await putAnswer(person, 'address', 'Beach Road');
    const rows = await database.system
      .selectFrom('business_answers')
      .select(['question_key', 'status'])
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(onlyConfirmedAnswers(rows).map((row) => row.question_key)).toEqual(['address']);
    await confirmAnswers(person, ['business_name']);
    const after = await database.system
      .selectFrom('business_answers')
      .select(['question_key', 'status'])
      .where('account_id', '=', person.profile.business.id)
      .execute();
    expect(
      onlyConfirmedAnswers(after)
        .map((row) => row.question_key)
        .sort(),
    ).toEqual(['address', 'business_name']);
  });
});
