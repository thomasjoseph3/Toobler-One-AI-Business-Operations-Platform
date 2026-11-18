import { parse } from 'csv-parse/sync';
import { describe, expect, it } from 'vitest';
import { neutraliseFormula, writeCsv } from './write-csv';

describe('writeCsv', () => {
  it('writes a byte order mark, the header, then the rows with \\r\\n line ends', () => {
    expect(writeCsv({ headers: ['Name', 'Phone'], rows: [['Priya', '+919847012345']] })).toBe(
      '﻿Name,Phone\r\nPriya,+919847012345\r\n',
    );
  });

  it('quotes a cell with a comma, a quote or a line break, and doubles the quotes', () => {
    const text = writeCsv({ headers: ['A'], rows: [['Menon, Priya'], ['She said "hi"'], ['two\nlines']] });
    expect(text).toContain('"Menon, Priya"');
    expect(text).toContain('"She said ""hi"""');
    expect(text).toContain('"two\nlines"');
  });

  it('can be read back exactly by a CSV reader, whatever is in the cells', () => {
    const rows = [
      ['a,b', 'c"d', 'line\r\nbreak'],
      ['', 'plain', 'ñ Malayalam മലയാളം'],
    ];
    const read = parse(writeCsv({ headers: ['x', 'y', 'z'], rows }), { bom: true }) as string[][];
    expect(read).toEqual([['x', 'y', 'z'], ...rows]);
  });

  it('makes a formula safe: a cell starting with =, +, - or @ becomes plain text', () => {
    for (const dangerous of ['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) {
      expect(neutraliseFormula(dangerous).startsWith("'")).toBe(true);
    }
    expect(neutraliseFormula('Priya')).toBe('Priya');
    expect(neutraliseFormula('')).toBe('');
    // A phone number and a plain negative number must come out exactly as they are in the system
    expect(neutraliseFormula('+919847012345')).toBe('+919847012345');
    expect(neutraliseFormula('+91 98470 12345')).toBe('+91 98470 12345');
    expect(neutraliseFormula('+971 (50) 123-4567')).toBe("'+971 (50) 123-4567");
    expect(neutraliseFormula('-5')).toBe('-5');
    expect(neutraliseFormula('-5,000.50')).toBe('-5,000.50');
    // A normal value that is not a formula start stays as it is
    expect(neutraliseFormula('5-3')).toBe('5-3');
    expect(writeCsv({ headers: ['Name'], rows: [['=2+2']] })).toContain("'=2+2");
  });
});
