import { describe, expect, it } from 'vitest';
import type { SetupStepStatus } from '@toobler-one/shared';
import { computePercentDone, isCheckedBySystem, resolveSetupSteps, SETUP_STEPS } from './setup-steps';

const NOTHING_FOUND = { aboutBusinessAnswered: false, hasOfferingSwitchedOn: false, hasTriedTheAgent: false };

describe('resolveSetupSteps', () => {
  it('lists every step in order, all todo for a new business', () => {
    const steps = resolveSetupSteps(new Map(), NOTHING_FOUND);
    expect(steps.map((step) => step.key)).toEqual(SETUP_STEPS.map((step) => step.key));
    expect(steps.every((step) => step.status === 'todo')).toBe(true);
  });

  it('takes the owner-marked status for the steps the owner marks', () => {
    const marked = new Map<string, SetupStepStatus>([
      ['pipeline', 'done'],
      ['team', 'skipped'],
    ]);
    const steps = resolveSetupSteps(marked, NOTHING_FOUND);
    expect(steps.find((step) => step.key === 'pipeline')?.status).toBe('done');
    expect(steps.find((step) => step.key === 'team')?.status).toBe('skipped');
    expect(steps.find((step) => step.key === 'channels')?.status).toBe('todo');
  });

  it('works out the checked steps from the facts, and ignores anything the owner stored for them', () => {
    const marked = new Map<string, SetupStepStatus>([['about_business', 'done']]);
    const before = resolveSetupSteps(marked, NOTHING_FOUND);
    expect(before.find((step) => step.key === 'about_business')?.status).toBe('todo');

    const after = resolveSetupSteps(new Map(), { aboutBusinessAnswered: true, hasOfferingSwitchedOn: true, hasTriedTheAgent: true });
    expect(after.find((step) => step.key === 'about_business')?.status).toBe('done');
    expect(after.find((step) => step.key === 'what_you_sell')?.status).toBe('done');
    expect(after.find((step) => step.key === 'test_agent')?.status).toBe('done');
  });
});

describe('isCheckedBySystem', () => {
  it('is true for the steps worked out from answers and false for the ones the owner marks', () => {
    expect(isCheckedBySystem('about_business')).toBe(true);
    expect(isCheckedBySystem('what_you_sell')).toBe(true);
    expect(isCheckedBySystem('test_agent')).toBe(true);
    expect(isCheckedBySystem('pipeline')).toBe(false);
    expect(isCheckedBySystem('promises')).toBe(false);
  });
});

describe('computePercentDone', () => {
  it('counts only done steps, not skipped ones, as a whole percent', () => {
    const marked = new Map<string, SetupStepStatus>([
      ['website', 'done'],
      ['team', 'skipped'],
    ]);
    // 1 done out of 10 steps
    expect(computePercentDone(resolveSetupSteps(marked, NOTHING_FOUND))).toBe(10);
  });

  it('is 0 with no steps and 100 when every step is done', () => {
    expect(computePercentDone([])).toBe(0);
    const everythingDone = new Map<string, SetupStepStatus>(SETUP_STEPS.map((step) => [step.key, 'done']));
    const steps = resolveSetupSteps(everythingDone, { aboutBusinessAnswered: true, hasOfferingSwitchedOn: true, hasTriedTheAgent: true });
    expect(computePercentDone(steps)).toBe(100);
  });
});
