// The pretend business profile for the browser tests: a few questions of different kinds, their answers, the situations, the settings and a
// reading of the website. It answers the same calls as the real API (`/knowledge/...`), keeps what the page sends, and can be told to refuse.

export interface PretendKnowledge {
  /** The questions as the API gives them (their answers change as the page saves). */
  questions: Array<Record<string, unknown>>;
  situations: Array<Record<string, unknown>>;
  settings: { timeZone: string; defaultCountry: string; callbackPromiseMinutes: number };
  /** What the page sent to `PUT /knowledge/answers/{key}`, `POST /knowledge/answers/confirm`, `PUT /knowledge/settings`, `PUT /knowledge/situations/{key}` and `POST /knowledge/prefill`. */
  savedAnswers: Array<{ key: string; value: unknown }>;
  confirmedKeys: string[][];
  savedSettings: Array<Record<string, unknown>>;
  chosenSituations: Array<{ key: string; choice: string }>;
  startedReadings: Array<Record<string, unknown>>;
  /** When set, the next save of an answer is refused with this message (400 INVALID_ANSWER). */
  answerRefusal: string | null;
  /** When set, starting a reading is refused with this status, code and message. */
  readingRefusal: { status: number; code: string; message: string } | null;
  /** How the reading ends: found answers and suggestions (`done`), or a failure (`failed`). */
  readingOutcome: 'done' | 'failed';
  /** How many times the page asked how the reading is going. */
  readingChecks: number;
  /** When true, `GET /knowledge/questions` fails with a server error. */
  questionsFail: boolean;
}

export const PRETEND_RUN_ID = '0191f0a0-0000-7000-8000-0000000000c1';
const PRETEND_NOW = '2026-11-17T10:00:00.000Z';

const answerOf = (value: unknown, status: 'check' | 'confirmed', source: 'typed' | 'website' = 'typed') => ({
  value,
  source,
  status,
  confirmedAt: status === 'confirmed' ? PRETEND_NOW : null,
  updatedAt: PRETEND_NOW,
});

/** One pretend question with every field the API gives, so a test only writes what is special about it. */
function question(fields: Record<string, unknown>) {
  return {
    options: null,
    allowOther: false,
    maxChoices: null,
    yesDetail: null,
    rowFields: null,
    maxRows: null,
    neededToGoLive: false,
    handledElsewhere: null,
    elsewhereStatus: null,
    usedFor: null,
    answer: null,
    ...fields,
  };
}

/** The starting profile: one answer waiting for a check, some answered, some not, and one answered elsewhere. */
export function startingKnowledge(): PretendKnowledge {
  return {
    questions: [
      question({
        key: 'has_website',
        section: 'A',
        text: 'Do you have a website?',
        type: 'yes_no',
        yesDetail: { kind: 'link', required: true, label: 'Website address' },
        answer: answerOf({ yes: true, detail: 'https://nairstays.example' }, 'confirmed'),
      }),
      question({
        key: 'business_name',
        section: 'B',
        text: 'What do customers call your business?',
        type: 'short_text',
        neededToGoLive: true,
        answer: answerOf('Nair Stays', 'check', 'website'),
      }),
      question({ key: 'business_summary', section: 'B', text: 'What does your business do, in one or two lines?', type: 'long_text', neededToGoLive: true }),
      question({
        key: 'contact_details',
        section: 'B',
        text: 'Phone numbers and email customers can use',
        type: 'list',
        maxRows: 10,
        neededToGoLive: true,
        rowFields: [
          { key: 'kind', label: 'Kind', kind: 'pick', options: ['Phone', 'Email'], required: true },
          { key: 'value', label: 'Number or address', kind: 'text', options: null, required: true },
        ],
      }),
      question({
        key: 'opening_hours',
        section: 'B',
        text: "Opening hours, and days you're closed",
        type: 'weekly_hours',
        neededToGoLive: true,
        answer: answerOf({ days: { mon: { open: '09:00', close: '18:00' } } }, 'confirmed'),
      }),
      question({
        key: 'customer_languages',
        section: 'B',
        text: 'Which languages do your customers speak?',
        type: 'pick_several',
        options: ['Malayalam', 'English', 'Hindi'],
      }),
      question({
        key: 'offerings',
        section: 'C',
        text: 'What do you sell?',
        type: 'list',
        neededToGoLive: true,
        handledElsewhere: 'offerings',
        elsewhereStatus: 'not_done',
      }),
      question({
        key: 'cancellation_policy',
        section: 'D',
        text: 'Cancellation and refund policy',
        type: 'long_text',
        answer: answerOf('Free cancellation up to 48 hours before.', 'confirmed'),
      }),
      question({ key: 'prices_gst', section: 'C', text: 'Do your prices include GST?', type: 'pick_one', options: ['Included', 'Plus GST', 'No GST'] }),
    ],
    situations: [
      {
        key: 'discount_request',
        text: 'A customer asks for a discount',
        fixed: false,
        choices: [
          { key: 'call_with_best_price', label: 'Staff will call with the best price' },
          { key: 'prices_are_fixed', label: 'Prices are fixed' },
        ],
        selectedChoiceKey: 'call_with_best_price',
        isDefault: true,
        updatedAt: null,
      },
      {
        key: 'complaint',
        text: 'A customer complains',
        fixed: true,
        choices: [{ key: 'pass_to_manager', label: 'Apologise, pass to the manager and raise a ticket' }],
        selectedChoiceKey: 'pass_to_manager',
        isDefault: true,
        updatedAt: null,
      },
    ],
    settings: { timeZone: 'Asia/Kolkata', defaultCountry: 'IN', callbackPromiseMinutes: 15 },
    savedAnswers: [],
    confirmedKeys: [],
    savedSettings: [],
    chosenSituations: [],
    startedReadings: [],
    answerRefusal: null,
    readingRefusal: null,
    readingOutcome: 'done',
    readingChecks: 0,
    questionsFail: false,
  };
}

/** The keys of the "needed to go live" questions that have no confirmed answer. */
export function neededMissingKeys(knowledge: PretendKnowledge): string[] {
  return progressOf(knowledge).neededToGoLiveStillMissing;
}

/** How complete the profile is, worked out from the questions the way the API does it (confirmed answers count). */
function progressOf(knowledge: PretendKnowledge) {
  const counted = knowledge.questions.filter((item) => item['handledElsewhere'] === null || item['elsewhereStatus'] !== 'not_tracked');
  const isAnswered = (item: Record<string, unknown>) =>
    item['handledElsewhere'] !== null
      ? item['elsewhereStatus'] === 'done'
      : (item['answer'] as { status?: string } | null)?.status === 'confirmed';
  const answeredQuestions = counted.filter(isAnswered).length;
  const neededMissing = counted.filter((item) => item['neededToGoLive'] === true && !isAnswered(item)).map((item) => String(item['key']));
  return {
    totalQuestions: counted.length,
    answeredQuestions,
    waitingForCheck: counted.filter((item) => (item['answer'] as { status?: string } | null)?.status === 'check').length,
    percentComplete: Math.round((answeredQuestions / counted.length) * 100),
    stillToAnswer: counted.filter((item) => !isAnswered(item)).map((item) => String(item['key'])),
    readyToGoLive: neededMissing.length === 0,
    neededToGoLiveStillMissing: neededMissing,
  };
}

/** What a call to the pretend API gives back: a status and a JSON body (or none). */
export interface PretendAnswer {
  status: number;
  body?: unknown;
}

/** Answers a `/knowledge/...` call, or says nothing (undefined) when the call is not about the profile. */
export function answerKnowledgeCall(
  knowledge: PretendKnowledge,
  call: { method: string; path: string; body: Record<string, unknown> | null; role: 'manager' | 'staff' },
): PretendAnswer | undefined {
  const { method, path, body, role } = call;
  const refuseStaff = (): PretendAnswer => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } });

  if (path === '/knowledge/questions' && method === 'GET') {
    if (knowledge.questionsFail) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: { questions: knowledge.questions, progress: progressOf(knowledge) } };
  }

  const answerMatch = /^\/knowledge\/answers\/([a-z_]+)$/.exec(path);
  if (answerMatch && method === 'PUT') {
    if (role !== 'manager') return refuseStaff();
    if (knowledge.answerRefusal) {
      return { status: 400, body: { error: { code: 'INVALID_ANSWER', message: knowledge.answerRefusal } } };
    }
    const key = answerMatch[1]!;
    knowledge.savedAnswers.push({ key, value: body?.['value'] });
    const item = knowledge.questions.find((candidate) => candidate['key'] === key);
    if (item) item['answer'] = answerOf(body?.['value'], 'confirmed');
    return { status: 200, body: { question: item, progress: progressOf(knowledge) } };
  }

  if (path === '/knowledge/answers/confirm' && method === 'POST') {
    if (role !== 'manager') return refuseStaff();
    const keys = (body?.['questionKeys'] as string[]) ?? [];
    knowledge.confirmedKeys.push(keys);
    for (const item of knowledge.questions) {
      const answer = item['answer'] as { status?: string; value?: unknown; source?: 'typed' | 'website' } | null;
      if (keys.includes(String(item['key'])) && answer?.status === 'check') item['answer'] = answerOf(answer.value, 'confirmed', answer.source);
    }
    return { status: 200, body: { confirmed: keys, progress: progressOf(knowledge) } };
  }

  if (path === '/knowledge/situations' && method === 'GET') return { status: 200, body: { items: knowledge.situations } };
  const situationMatch = /^\/knowledge\/situations\/([a-z_]+)$/.exec(path);
  if (situationMatch && method === 'PUT') {
    if (role !== 'manager') return refuseStaff();
    const key = situationMatch[1]!;
    const choice = String(body?.['choice']);
    knowledge.chosenSituations.push({ key, choice });
    const situation = knowledge.situations.find((candidate) => candidate['key'] === key);
    if (situation) Object.assign(situation, { selectedChoiceKey: choice, isDefault: false, updatedAt: PRETEND_NOW });
    return { status: 200, body: situation };
  }

  if (path === '/knowledge/settings' && method === 'GET') return { status: 200, body: knowledge.settings };
  if (path === '/knowledge/settings' && method === 'PUT') {
    if (role !== 'manager') return refuseStaff();
    knowledge.savedSettings.push(body ?? {});
    Object.assign(knowledge.settings, body ?? {});
    return { status: 200, body: knowledge.settings };
  }

  if (path === '/knowledge/prefill' && method === 'POST') {
    if (role !== 'manager') return refuseStaff();
    if (knowledge.readingRefusal) {
      const { status, code, message } = knowledge.readingRefusal;
      return { status, body: { error: { code, message } } };
    }
    knowledge.startedReadings.push(body ?? {});
    knowledge.readingChecks = 0;
    return { status: 202, body: readingRun(knowledge, 'queued') };
  }
  if (path === `/knowledge/prefill/${PRETEND_RUN_ID}` && method === 'GET') {
    knowledge.readingChecks += 1;
    // The first check finds it still reading; the second finds it finished
    if (knowledge.readingChecks < 2) return { status: 200, body: readingRun(knowledge, 'reading') };
    if (knowledge.readingOutcome === 'done') {
      const summary = knowledge.questions.find((candidate) => candidate['key'] === 'business_summary');
      if (summary && summary['answer'] === null) summary['answer'] = answerOf('A family homestay by the sea.', 'check', 'website');
      return { status: 200, body: readingRun(knowledge, 'done') };
    }
    return { status: 200, body: readingRun(knowledge, 'failed') };
  }
  return undefined;
}

/** A reading in one of its states, as the API gives it. */
function readingRun(knowledge: PretendKnowledge, status: 'queued' | 'reading' | 'done' | 'failed') {
  const isDone = status === 'done';
  const websiteUrl = String(knowledge.startedReadings[knowledge.startedReadings.length - 1]?.['websiteUrl'] ?? 'https://nairstays.example/');
  return {
    id: PRETEND_RUN_ID,
    status,
    websiteUrl,
    googleListing: null,
    errorCode: status === 'failed' ? 'WEBSITE_TIMEOUT' : null,
    errorMessage: status === 'failed' ? 'The website took too long to answer.' : null,
    pagesRead: isDone ? 3 : 0,
    answersFound: isDone ? ['business_summary'] : [],
    answersSkipped: isDone ? 1 : 0,
    suggestedOfferings: isDone ? [{ name: 'Sea view room', description: 'By the beach', fromPricePaise: 250000 }, { name: 'Yoga class', description: null, fromPricePaise: null }] : [],
    createdAt: PRETEND_NOW,
    finishedAt: isDone || status === 'failed' ? PRETEND_NOW : null,
  };
}
