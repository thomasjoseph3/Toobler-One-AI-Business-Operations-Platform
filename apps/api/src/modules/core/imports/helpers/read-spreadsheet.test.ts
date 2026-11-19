import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../kernel/errors';
import { readSpreadsheet } from './read-spreadsheet';

const csv = (text: string) => Buffer.from(text, 'utf8');
const refusedWith = async (file: Buffer) => {
  try {
    await readSpreadsheet(file);
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, code: error.code };
    throw error;
  }
  return undefined;
};

describe('readSpreadsheet: CSV', () => {
  it('reads the header and the rows as texts, with quotes, commas inside cells and a byte order mark', async () => {
    const read = await readSpreadsheet(csv('﻿Name,Phone\n"Menon, Priya",98470 12345\nRahul,"94470 00111"\n'));
    expect(read.headers).toEqual(['Name', 'Phone']);
    expect(read.rows).toEqual([
      ['Menon, Priya', '98470 12345'],
      ['Rahul', '94470 00111'],
    ]);
  });

  it('knows semicolon and tab separated files, and Windows line endings', async () => {
    expect((await readSpreadsheet(csv('Name;Phone\r\nPriya;98470\r\n'))).rows).toEqual([['Priya', '98470']]);
    expect((await readSpreadsheet(csv('Name\tPhone\nPriya\t98470\n'))).rows).toEqual([['Priya', '98470']]);
  });

  it('names a blank header, pads short rows, and ignores empty rows at the end', async () => {
    const read = await readSpreadsheet(csv('Name,,Phone\nPriya\nRahul,x,2\n,,\n,,\n'));
    expect(read.headers).toEqual(['Name', 'Column 2', 'Phone']);
    expect(read.rows).toEqual([
      ['Priya', '', ''],
      ['Rahul', 'x', '2'],
    ]);
  });

  it('cuts a very long cell and trims spaces', async () => {
    const read = await readSpreadsheet(csv(`Name,Phone\n  Priya  ,${'9'.repeat(2000)}\n`));
    expect(read.rows[0]![0]).toBe('Priya');
    expect(read.rows[0]![1]).toHaveLength(1000);
  });

  it('refuses what is not a usable file, with a plain code each', async () => {
    expect(await refusedWith(csv(''))).toEqual({ status: 400, code: 'EMPTY_FILE' });
    expect(await refusedWith(csv('Name,Phone\n'))).toEqual({ status: 400, code: 'EMPTY_FILE' });
    expect(await refusedWith(csv(',,\n,,\n'))).toEqual({ status: 400, code: 'EMPTY_FILE' });
    expect(await refusedWith(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]))).toEqual({
      status: 400,
      code: 'INVALID_FILE',
    });
    expect(await refusedWith(Buffer.concat([Buffer.from('PK'), Buffer.from('not really a zip file')]))).toEqual({
      status: 400,
      code: 'INVALID_FILE',
    });
    const wide = Array.from({ length: 61 }, (_, index) => `c${index}`).join(',');
    expect(await refusedWith(csv(`${wide}\n1\n`))).toEqual({ status: 400, code: 'TOO_MANY_COLUMNS' });
    const tall = ['Phone', ...Array.from({ length: 50_001 }, (_, index) => String(index))].join('\n');
    expect(await refusedWith(csv(tall))).toEqual({ status: 413, code: 'TOO_MANY_ROWS' });
  });
});

describe('readSpreadsheet: Excel', () => {
  it('reads the first sheet of an .xlsx file as texts', async () => {
    const read = await readSpreadsheet(
      readFileSync(new URL('../../../../../test/fixtures/customers.xlsx', import.meta.url)),
    );
    expect(read.headers).toEqual(['Full Name', 'Mobile', 'E-mail', 'Company', 'Car model', 'Birthday']);
    expect(read.rows).toHaveLength(4);
    expect(read.rows[0]).toEqual([
      'Priya Menon',
      '98470 12345',
      'priya@menon.example',
      'Infosys HR',
      'Swift',
      '1990-05-04',
    ]);
  });
});
