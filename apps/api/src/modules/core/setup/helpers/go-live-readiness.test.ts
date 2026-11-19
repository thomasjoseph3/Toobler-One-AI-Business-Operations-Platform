import { describe, expect, it } from 'vitest';
import { findGoLiveBlockers } from './go-live-readiness';

describe('findGoLiveBlockers', () => {
  it('lists the missing questions first, then the steps still to do', () => {
    expect(
      findGoLiveBlockers({
        neededQuestionsStillMissing: ['business_name', 'address'],
        promisesStepDone: false,
        hasTriedTheAgent: false,
      }),
    ).toEqual([
      { kind: 'question', key: 'business_name' },
      { kind: 'question', key: 'address' },
      { kind: 'step', key: 'promises' },
      { kind: 'step', key: 'test_agent' },
    ]);
  });

  it('says only what is still missing', () => {
    expect(
      findGoLiveBlockers({ neededQuestionsStillMissing: [], promisesStepDone: true, hasTriedTheAgent: false }),
    ).toEqual([{ kind: 'step', key: 'test_agent' }]);
  });

  it('is empty when the business may go live', () => {
    expect(
      findGoLiveBlockers({ neededQuestionsStillMissing: [], promisesStepDone: true, hasTriedTheAgent: true }),
    ).toEqual([]);
  });
});
