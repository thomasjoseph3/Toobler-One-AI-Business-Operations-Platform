// The pretend setup wizard for the browser tests: the steps, what the owner marked, the industry words and going live. It answers the same
// calls as the real API (`/setup`, `/setup/apply-preset`, `/setup/go-live`) and keeps what the page sent.

import { neededMissingKeys, type PretendKnowledge } from './pretend-knowledge';
import type { PretendAnswer } from './pretend-knowledge';

type StepStatus = 'todo' | 'done' | 'skipped';

export interface PretendSetup {
  /** What the owner marked on the steps the owner marks. */
  marked: Record<string, StepStatus>;
  /** Whether the owner has tried the agent (the step the system checks). */
  triedTheAgent: boolean;
  liveAt: string | null;
  /** What the page sent: `PATCH /setup` bodies, and how many times it asked to apply the preset or go live. */
  patches: Array<Record<string, unknown>>;
  presetCalls: number;
  goLiveCalls: number;
  /** What applying the words does, as the API answers. */
  presetResult: { industry: string; renamedStages: Array<{ from: string; to: string }>; leftAloneStages: string[] };
  /** When true, `GET /setup` fails with a server error. */
  setupFails: boolean;
}

export function startingSetup(): PretendSetup {
  return {
    marked: {},
    triedTheAgent: false,
    liveAt: null,
    patches: [],
    presetCalls: 0,
    goLiveCalls: 0,
    presetResult: {
      industry: 'hotel_resort',
      renamedStages: [
        { from: 'New', to: 'New enquiry' },
        { from: 'Contacted', to: 'Called' },
        { from: 'Quoted', to: 'Rate sent' },
      ],
      leftAloneStages: [],
    },
    setupFails: false,
  };
}

const STEPS: Array<{ key: string; part: 1 | 2; checkedBySystem: boolean }> = [
  { key: 'website', part: 1, checkedBySystem: false },
  { key: 'about_business', part: 1, checkedBySystem: true },
  { key: 'what_you_sell', part: 1, checkedBySystem: true },
  { key: 'situations', part: 1, checkedBySystem: false },
  { key: 'goals', part: 1, checkedBySystem: false },
  { key: 'promises', part: 2, checkedBySystem: false },
  { key: 'pipeline', part: 2, checkedBySystem: false },
  { key: 'team', part: 2, checkedBySystem: false },
  { key: 'channels', part: 2, checkedBySystem: false },
  { key: 'test_agent', part: 2, checkedBySystem: true },
];

/** The whole setup picture, worked out the way the API does it. */
function picture(setup: PretendSetup, knowledge: PretendKnowledge) {
  const missingQuestions = neededMissingKeys(knowledge);
  const aboutBusinessAnswered = !missingQuestions.some((key) =>
    ['business_name', 'business_summary', 'contact_details', 'opening_hours', 'customer_languages'].includes(key),
  );
  const offeringsDone = !missingQuestions.includes('offerings');
  const steps = STEPS.map((step) => {
    let status: StepStatus = setup.marked[step.key] ?? 'todo';
    if (step.key === 'about_business') status = aboutBusinessAnswered ? 'done' : 'todo';
    if (step.key === 'what_you_sell') status = offeringsDone ? 'done' : 'todo';
    if (step.key === 'test_agent') status = setup.triedTheAgent ? 'done' : 'todo';
    return { ...step, status };
  });
  const blockers = [
    ...missingQuestions.map((key) => ({ kind: 'question', key })),
    ...(setup.marked['promises'] === 'done' ? [] : [{ kind: 'step', key: 'promises' }]),
    ...(setup.triedTheAgent ? [] : [{ kind: 'step', key: 'test_agent' }]),
  ];
  return {
    steps,
    percentDone: Math.round((steps.filter((step) => step.status === 'done').length / steps.length) * 100),
    neededToGoLiveStillMissing: missingQuestions,
    blockers,
    readyToGoLive: blockers.length === 0,
    isLive: setup.liveAt !== null,
    liveAt: setup.liveAt,
  };
}

/** Answers a `/setup...` call, or says nothing (undefined) when the call is not about the setup. */
export function answerSetupCall(
  setup: PretendSetup,
  knowledge: PretendKnowledge,
  call: { method: string; path: string; body: Record<string, unknown> | null; role: 'manager' | 'staff' },
): PretendAnswer | undefined {
  const { method, path, body, role } = call;
  if (!path.startsWith('/setup')) return undefined;
  if (role !== 'manager') return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };

  if (path === '/setup' && method === 'GET') {
    if (setup.setupFails) return { status: 500, body: { error: { code: 'BROKEN', message: 'Broken.' } } };
    return { status: 200, body: picture(setup, knowledge) };
  }
  if (path === '/setup' && method === 'PATCH') {
    setup.patches.push(body ?? {});
    const step = STEPS.find((candidate) => candidate.key === body?.['step']);
    if (!step || step.checkedBySystem) {
      return {
        status: 400,
        body: {
          error: { code: 'STEP_CHECKED_BY_SYSTEM', message: 'This step is finished by answering its questions.' },
        },
      };
    }
    setup.marked[step.key] = body?.['status'] as StepStatus;
    return { status: 200, body: picture(setup, knowledge) };
  }
  if (path === '/setup/apply-preset' && method === 'POST') {
    setup.presetCalls += 1;
    setup.marked['pipeline'] = 'done';
    return { status: 200, body: setup.presetResult };
  }
  if (path === '/setup/go-live' && method === 'POST') {
    setup.goLiveCalls += 1;
    const current = picture(setup, knowledge);
    if (!current.readyToGoLive) {
      return {
        status: 409,
        body: {
          error: {
            code: 'NOT_READY',
            message: 'Finish the steps below before going live.',
            details: { blockers: current.blockers },
          },
        },
      };
    }
    setup.liveAt = setup.liveAt ?? '2026-11-17T10:30:00.000Z';
    return { status: 200, body: { liveAt: setup.liveAt } };
  }
  return undefined;
}
