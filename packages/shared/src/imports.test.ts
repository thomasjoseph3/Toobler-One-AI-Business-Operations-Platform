import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from './custom-fields';
import { checkImportMapping, guessColumnTargets, readImportRow } from './imports';

const field = (key: string, label: string): FieldDefinition => ({
  id: key,
  object: 'contact',
  key,
  label,
  type: 'text',
  options: [],
  aiAsks: false,
  requiredForWon: false,
});
const fields = [field('car_model', 'Car model'), field('birthday', 'Birthday')];

describe('guessColumnTargets', () => {
  it('knows the usual names for name, phone, email, company and language, whatever the capitals and punctuation', () => {
    expect(
      guessColumnTargets(['Full Name', 'Mobile No.', 'E-mail', 'Organisation', 'Language', 'Notes'], fields),
    ).toEqual(['name', null, 'email', 'company', 'language', null]);
    expect(guessColumnTargets(['NAME', 'Phone Number', 'EMAIL ADDRESS'], fields)).toEqual(['name', 'phone', 'email']);
  });

  it('knows the business’s own contact fields by label or key', () => {
    expect(guessColumnTargets(['Car Model', 'birthday', 'car_model'], fields)).toEqual([
      'custom.car_model',
      'custom.birthday',
      null,
    ]);
  });

  it('gives a target to the first matching column only', () => {
    expect(guessColumnTargets(['Phone', 'Mobile', 'WhatsApp'], [])).toEqual(['phone', null, null]);
  });

  it('leaves a blank or unknown column alone', () => {
    expect(guessColumnTargets(['', '   ', 'Favourite colour'], fields)).toEqual([null, null, null]);
  });
});

describe('checkImportMapping', () => {
  it('accepts a mapping with a phone or an email', () => {
    expect(checkImportMapping(['name', 'phone', null], 3, fields)).toEqual([]);
    expect(checkImportMapping([null, 'email', 'custom.car_model'], 3, fields)).toEqual([]);
  });

  it('refuses a mapping of the wrong length, an unknown target, a repeated target, and one with no phone or email', () => {
    expect(checkImportMapping(['phone'], 2, fields)[0]!.message).toContain('2 columns');
    expect(checkImportMapping(['phone', 'colour'], 2, fields)[0]).toEqual({
      column: 1,
      message: 'That is not something an import can fill in.',
    });
    expect(checkImportMapping(['phone', 'phone'], 2, fields)[0]).toEqual({
      column: 1,
      message: 'Two columns cannot fill in the same thing.',
    });
    expect(checkImportMapping(['name', 'company'], 2, fields)[0]!.message).toContain('reachable');
    expect(checkImportMapping(['custom.gone', 'phone'], 2, fields)[0]!.column).toBe(0);
  });
});

describe('readImportRow', () => {
  it('reads the cells through the mapping, trimmed, leaving out empty cells', () => {
    expect(
      readImportRow(
        ['  Priya  ', '+91 98470 12345', '', 'Swift', 'Infosys'],
        ['name', 'phone', 'email', 'custom.car_model', 'company'],
      ),
    ).toEqual({
      name: 'Priya',
      phone: '+91 98470 12345',
      company: 'Infosys',
      custom: { car_model: 'Swift' },
    });
    expect(readImportRow([], ['name'])).toEqual({ custom: {} });
  });
});
