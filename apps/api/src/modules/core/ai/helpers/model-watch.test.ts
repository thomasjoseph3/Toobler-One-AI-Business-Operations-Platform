import { describe, expect, it } from 'vitest';
import type { CatalogueModel } from './choose-models-for-task';
import { findMissingModels, findNewModelCandidates, retirementWarningDue } from './model-watch';

const model = (overrides: Partial<CatalogueModel> & Pick<CatalogueModel, 'modelName'>): CatalogueModel => ({
  id: `id-${overrides.modelName}`,
  provider: 'gemini',
  label: overrides.modelName,
  tasks: [],
  status: 'active',
  kind: 'text',
  size: 'small',
  isAlias: false,
  retiresOn: null,
  sortOrder: 100,
  ...overrides,
});

describe('findMissingModels', () => {
  const catalogue = [
    model({ modelName: 'here' }),
    model({ modelName: 'gone' }),
    model({ modelName: 'old-and-gone', status: 'deprecated' }),
    model({ modelName: 'already-retired', status: 'retired' }),
    model({ modelName: 'talker', kind: 'voice' }),
    model({ modelName: 'gpt-gone', provider: 'openai' }),
  ];

  it('lists our live text models of this company that the company no longer shows', () => {
    expect(findMissingModels(catalogue, 'gemini', ['here']).map((found) => found.modelName)).toEqual([
      'gone',
      'old-and-gone',
    ]);
  });

  it('is empty when everything is still listed, and does not look at another company’s models', () => {
    expect(findMissingModels(catalogue, 'gemini', ['here', 'gone', 'old-and-gone'])).toEqual([]);
    expect(findMissingModels(catalogue, 'openai', []).map((found) => found.modelName)).toEqual(['gpt-gone']);
  });
});

describe('findNewModelCandidates', () => {
  it('suggests ordinary chat models we do not have, and skips dated copies, previews and non-chat models', () => {
    const listed = [
      'gemini-3.8-flash',
      'gemini-3.5-flash',
      'gemini-3.6-flash-preview',
      'gemini-2.5-flash-image',
      'gemini-3.1-pro',
      'gemini-flash-latest',
      'text-embedding-004',
    ];
    expect(findNewModelCandidates('gemini', listed, new Set(['gemini-3.5-flash']))).toEqual([
      'gemini-3.1-pro',
      'gemini-3.8-flash',
    ]);
  });

  it('knows each company’s names', () => {
    expect(
      findNewModelCandidates(
        'openai',
        ['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17', 'gpt-4o', 'gpt-5-audio', 'gpt-4o-mini', 'o1'],
        new Set(['gpt-4o-mini']),
      ),
    ).toEqual(['gpt-4o', 'gpt-5.4-mini']);
    expect(
      findNewModelCandidates(
        'anthropic',
        ['claude-haiku-5-5', 'claude-haiku-4-5-20251001', 'claude-opus-5'],
        new Set(),
      ),
    ).toEqual(['claude-haiku-5-5', 'claude-opus-5']);
  });

  it('suggests at most ten, once each', () => {
    const many = Array.from({ length: 15 }, (_, index) => `gemini-${index + 1}-flash`);
    expect(findNewModelCandidates('gemini', [...many, ...many], new Set())).toHaveLength(10);
  });
});

describe('retirementWarningDue', () => {
  const now = new Date('2026-11-13T15:00:00Z');

  it('warns 30 days ahead, 7 days ahead, and when the day has come', () => {
    expect(retirementWarningDue('2026-12-13', now)).toBe('30_days');
    expect(retirementWarningDue('2026-12-12', now)).toBe('30_days');
    expect(retirementWarningDue('2026-11-20', now)).toBe('7_days');
    expect(retirementWarningDue('2026-11-14', now)).toBe('7_days');
    expect(retirementWarningDue('2026-11-13', now)).toBe('passed');
    expect(retirementWarningDue('2026-01-01', now)).toBe('passed');
  });

  it('says nothing when it is further away than 30 days or there is no date', () => {
    expect(retirementWarningDue('2026-12-14', now)).toBeNull();
    expect(retirementWarningDue('2030-01-01', now)).toBeNull();
    expect(retirementWarningDue(null, now)).toBeNull();
  });
});
