import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../api/client';
import { t } from '../../app/i18n';
import { describeSaveProblem } from './problem-message';

describe('describeSaveProblem', () => {
  it("shows the API's own words when it refused the answer", () => {
    expect(describeSaveProblem(new ApiRequestError(400, 'INVALID_ANSWER', 'Pick one of Included, Plus GST'))).toBe(
      'Pick one of Included, Plus GST',
    );
    expect(
      describeSaveProblem(
        new ApiRequestError(400, 'INVALID_COUNTRY', 'That is not a country phone numbers exist for.'),
      ),
    ).toContain('country');
  });

  it('shows the words of the reading refusals too (a private address, one already running, the daily limit)', () => {
    for (const code of ['WEBSITE_NOT_PUBLIC', 'PREFILL_ALREADY_RUNNING', 'PREFILL_LIMIT_REACHED']) {
      expect(
        describeSaveProblem(new ApiRequestError(code === 'WEBSITE_NOT_PUBLIC' ? 400 : 409, code, 'Plain words.')),
      ).toBe('Plain words.');
    }
  });

  it('says plainly when the server cannot be reached or the person may not change it', () => {
    expect(describeSaveProblem(new ApiRequestError(0, 'NETWORK_ERROR', 'x'))).toBe(t('knowledge.problem.network'));
    expect(describeSaveProblem(new ApiRequestError(403, 'FORBIDDEN', 'x'))).toBe(t('knowledge.problem.forbidden'));
  });

  it('never shows a code or a status for anything else', () => {
    expect(describeSaveProblem(new ApiRequestError(500, 'BOOM', 'internal detail'))).toBe(
      t('knowledge.problem.unknown'),
    );
    expect(describeSaveProblem(new Error('boom'))).toBe(t('knowledge.problem.unknown'));
  });
});
