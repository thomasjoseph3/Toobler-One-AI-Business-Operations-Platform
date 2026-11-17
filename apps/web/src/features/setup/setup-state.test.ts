import { describe, expect, it } from 'vitest';
import type { SetupStep } from '@toobler-one/shared';
import {
  countFinishedSteps,
  describeBlocker,
  describeStepButtons,
  findNextStep,
  statusAfterButton,
  stepsOfPart,
  STEP_DESCRIPTIONS,
} from './setup-state';

const step = (changes: Partial<SetupStep>): SetupStep => ({ key: 'website', part: 1, checkedBySystem: false, status: 'todo', ...changes });

describe('every step has words and a way to finish', () => {
  it('covers each step the API can send', () => {
    for (const key of ['website', 'about_business', 'what_you_sell', 'situations', 'goals', 'promises', 'pipeline', 'team', 'channels', 'test_agent'] as const) {
      expect(STEP_DESCRIPTIONS[key].titleKey, key).toBeTruthy();
      expect(STEP_DESCRIPTIONS[key].helpKey, key).toBeTruthy();
    }
  });

  it('never lets the owner skip what going live needs', () => {
    expect(STEP_DESCRIPTIONS.promises.canBeSkipped).toBe(false);
    expect(STEP_DESCRIPTIONS.about_business.canBeSkipped).toBe(false);
    expect(STEP_DESCRIPTIONS.test_agent.canBeSkipped).toBe(false);
    expect(STEP_DESCRIPTIONS.team.canBeSkipped).toBe(true);
  });
});

describe('describeStepButtons', () => {
  it('offers Done and Skip for a step the owner marks, and only Reopen once it is marked', () => {
    expect(describeStepButtons(step({ key: 'team' }))).toEqual(['mark_done', 'skip']);
    expect(describeStepButtons(step({ key: 'team', status: 'done' }))).toEqual(['reopen']);
    expect(describeStepButtons(step({ key: 'team', status: 'skipped' }))).toEqual(['reopen']);
  });

  it('offers only Done for a step going live needs, and nothing for a step the system checks', () => {
    expect(describeStepButtons(step({ key: 'promises' }))).toEqual(['mark_done']);
    expect(describeStepButtons(step({ key: 'about_business', checkedBySystem: true }))).toEqual([]);
    expect(describeStepButtons(step({ key: 'test_agent', checkedBySystem: true, status: 'done' }))).toEqual([]);
  });

  it('lets the pipeline step be skipped but finished by applying the words, not by a Done button', () => {
    expect(describeStepButtons(step({ key: 'pipeline' }))).toEqual(['skip']);
  });
});

describe('small helpers', () => {
  it('turns a button into the status it sets', () => {
    expect(statusAfterButton('mark_done')).toBe('done');
    expect(statusAfterButton('skip')).toBe('skipped');
    expect(statusAfterButton('reopen')).toBe('todo');
  });

  it('splits the steps by part and counts the finished ones (skipped counts as finished here)', () => {
    const steps = [step({ key: 'website', part: 1, status: 'done' }), step({ key: 'promises', part: 2, status: 'skipped' }), step({ key: 'team', part: 2 })];
    expect(stepsOfPart(steps, 2).map((item) => item.key)).toEqual(['promises', 'team']);
    expect(countFinishedSteps(stepsOfPart(steps, 2))).toEqual({ finished: 1, total: 2 });
  });

  it('points at the first step still to do', () => {
    expect(findNextStep([step({ key: 'website', status: 'done' }), step({ key: 'goals' }), step({ key: 'team' })])?.key).toBe('goals');
    expect(findNextStep([step({ status: 'skipped' })])).toBeUndefined();
  });

  it('says a blocker in words: the question text, or the step name', () => {
    const texts = new Map([['business_name', 'What do customers call your business?']]);
    const title = (key: string) => `Step ${key}`;
    expect(describeBlocker({ kind: 'question', key: 'business_name' }, texts, title)).toBe('What do customers call your business?');
    expect(describeBlocker({ kind: 'question', key: 'unknown_key' }, texts, title)).toBe('unknown_key');
    expect(describeBlocker({ kind: 'step', key: 'promises' }, texts, title)).toBe('Step promises');
  });
});
