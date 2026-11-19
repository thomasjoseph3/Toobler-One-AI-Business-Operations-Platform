import type { DuplicateRecord, DuplicateSuggestion, FieldDefinition } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { buildMergeRequest, describeRecord, listComparedFields } from './duplicates-state';

const emptyRecord: DuplicateRecord = {
  id: '',
  name: null,
  phone: null,
  email: null,
  language: null,
  lifecycleStage: 'new',
  companyId: null,
  companyName: null,
  domain: null,
  city: null,
  ownerUserId: null,
  ownerName: null,
  custom: {},
  createdAt: '2026-11-18T00:00:00.000Z',
};
const suggestion: DuplicateSuggestion = {
  id: 's1',
  object: 'contact',
  reasons: ['same_name_similar_phone'],
  a: { ...emptyRecord, id: 'a1', name: 'Anil Kumar', phone: '+971501234567', custom: { car: 'Swift' } },
  b: { ...emptyRecord, id: 'b1', name: 'Anil Kumar', phone: '+971501234568', email: 'anil@example.com' },
  aHasOpenLead: false,
  bHasOpenLead: false,
  createdAt: '2026-11-18T00:00:00.000Z',
};
const carField: FieldDefinition = {
  id: 'f1',
  object: 'contact',
  key: 'car',
  label: 'Car model',
  type: 'text',
  options: [],
  aiAsks: false,
  requiredForWon: false,
};

describe('listComparedFields', () => {
  it('marks the lines that differ, shows empty values as a dash, and adds the custom fields that have an answer', () => {
    const lines = listComparedFields(suggestion, [carField]);
    const byId = Object.fromEntries(lines.map((line) => [line.id, line]));
    expect(byId.name).toMatchObject({ differs: false });
    expect(byId.phone).toMatchObject({ differs: true, firstValue: '+971501234567', secondValue: '+971501234568' });
    expect(byId.email).toMatchObject({ differs: true, firstValue: '—', secondValue: 'anil@example.com' });
    expect(byId['custom-car']).toMatchObject({
      differs: true,
      label: 'Car model',
      firstValue: 'Swift',
      secondValue: '—',
    });
  });
});

describe('buildMergeRequest', () => {
  it('sends only the choices for lines that differ, with custom answers under custom', () => {
    const lines = listComparedFields(suggestion, [carField]);
    const request = buildMergeRequest('a', lines, { phone: 'b', name: 'b', 'custom-car': 'a' });
    expect(request).toEqual({ keep: 'a', take: { phone: 'b', custom: { car: 'a' } } });
  });
  it('sends no take at all when nothing was chosen', () => {
    expect(buildMergeRequest('b', listComparedFields(suggestion, []), {})).toEqual({ keep: 'b', take: {} });
  });
});

describe('describeRecord', () => {
  it('uses the name, then the phone, then the email', () => {
    expect(describeRecord(suggestion.a)).toBe('Anil Kumar');
    expect(describeRecord({ ...emptyRecord, phone: '+971501234567' })).toBe('+971501234567');
  });
});
