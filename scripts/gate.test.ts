import { describe, expect, it } from 'vitest';
import { checkFeatureRows, readFeatureRows } from './gate.mjs';

const table = (...rows: string[]) =>
  ['| ID | Feature | Status | Brief | Approved on |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
const everyBriefExists = () => true;
const problemsFor = (markdown: string, briefExists = everyBriefExists) =>
  checkFeatureRows(readFeatureRows(markdown), briefExists);

describe('gate', () => {
  it('reads the rows of the status table', () => {
    const rows = readFeatureRows(
      table('| F00 | Foundation | in_progress | [brief](../features/F00.md) | |', '| F01 | Sign in | planned | | |'),
    );
    expect(rows).toEqual([
      { id: 'F00', name: 'Foundation', status: 'in_progress', briefPath: '../features/F00.md', approvedOn: '' },
      { id: 'F01', name: 'Sign in', status: 'planned', briefPath: '', approvedOn: '' },
    ]);
  });

  it('accepts one feature in progress after approved ones', () => {
    expect(
      problemsFor(
        table(
          '| F00 | A | approved | | 2026-11-12 |',
          '| F01 | B | in_progress | [brief](b.md) | |',
          '| F02 | C | planned | | |',
        ),
      ),
    ).toEqual([]);
  });

  it('refuses two features in progress or review at once', () => {
    const problems = problemsFor(
      table('| F00 | A | in_progress | [brief](a.md) | |', '| F01 | B | in_review | [brief](b.md) | |'),
    );
    expect(problems).toContainEqual(expect.stringContaining('Only one feature may be in progress or in review'));
  });

  it('refuses to start a feature while an earlier one is not approved', () => {
    const problems = problemsFor(
      table('| F00 | A | in_review | [brief](a.md) | |', '| F01 | B | approved | | 2026-11-12 |'),
    );
    expect(problems).toContainEqual(
      expect.stringContaining('F01 is approved but F00 above it is not approved or deferred yet'),
    );
  });

  it('lets a deferred feature be skipped', () => {
    expect(problemsFor(table('| F00 | A | deferred | | |', '| F01 | B | in_progress | [brief](b.md) | |'))).toEqual([]);
  });

  it('needs a date for approved features and a brief for features being built', () => {
    expect(problemsFor(table('| F00 | A | approved | | |'))).toContainEqual(
      expect.stringContaining('no "Approved on" date'),
    );
    expect(problemsFor(table('| F00 | A | in_progress | | |'))).toContainEqual(
      expect.stringContaining('brief is missing'),
    );
    expect(problemsFor(table('| F00 | A | in_progress | [brief](gone.md) | |'), () => false)).toContainEqual(
      expect.stringContaining('brief is missing'),
    );
  });

  it('refuses unknown status words, repeated ids and an empty table', () => {
    expect(problemsFor(table('| F00 | A | finished | | |'))).toContainEqual(
      expect.stringContaining('status "finished"'),
    );
    expect(problemsFor(table('| F00 | A | planned | | |', '| F00 | B | planned | | |'))).toContainEqual(
      'F00 appears twice.',
    );
    expect(problemsFor('no table here')).toEqual(['No feature rows found in STATUS.md: keep its table format.']);
  });
});
