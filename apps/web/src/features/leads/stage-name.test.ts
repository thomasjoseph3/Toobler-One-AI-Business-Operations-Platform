import { describe, expect, it } from 'vitest';
import { checkStageName, MAX_STAGE_NAME_LENGTH } from './stage-name';

describe('checkStageName', () => {
  it('needs a name', () => {
    expect(checkStageName('')).toBe('pipeline.name.needed');
    expect(checkStageName('   ')).toBe('pipeline.name.needed');
  });

  it('refuses a name longer than 60 letters, after trimming', () => {
    expect(checkStageName('x'.repeat(MAX_STAGE_NAME_LENGTH + 1))).toBe('pipeline.name.tooLong');
    expect(checkStageName(' ' + 'x'.repeat(MAX_STAGE_NAME_LENGTH) + ' ')).toBeNull();
  });

  it('accepts an ordinary name', () => {
    expect(checkStageName('Site visit booked')).toBeNull();
  });
});
