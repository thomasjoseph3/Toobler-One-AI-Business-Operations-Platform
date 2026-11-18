import { describe, expect, it } from 'vitest';
import { describeTemperatureReason, findTemperatureColourClasses, findTemperatureWord } from './temperature';

describe('temperature display', () => {
  it('has a word for every temperature', () => {
    expect(['unscored', 'hot', 'warm', 'cold'].map((value) => findTemperatureWord(value as 'hot'))).toEqual([
      'Not scored',
      'Hot',
      'Warm',
      'Cold',
    ]);
  });
  it('uses the error, warning and information families for hot, warm and cold', () => {
    expect(findTemperatureColourClasses('hot')).toContain('error');
    expect(findTemperatureColourClasses('warm')).toContain('warning');
    expect(findTemperatureColourClasses('cold')).toContain('info');
  });
  it('gives the reason, or says there is none yet', () => {
    expect(describeTemperatureReason('Asked to book')).toBe('Asked to book');
    expect(describeTemperatureReason(null)).toBe('Not scored yet: it is scored after the first conversation.');
  });
});
