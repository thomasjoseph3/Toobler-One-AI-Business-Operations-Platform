import { describe, expect, it } from 'vitest';
import { findProblemsInTaskModels } from './check-task-models';
import type { CatalogueModel } from './choose-models-for-task';

const model = (overrides: Partial<CatalogueModel> & Pick<CatalogueModel, 'id' | 'modelName'>): CatalogueModel => ({
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
const catalogue = [
  model({ id: 'a', modelName: 'model-a' }),
  model({ id: 'b', modelName: 'model-b', status: 'deprecated' }),
  model({ id: 'c', modelName: 'model-c', status: 'retired' }),
  model({ id: 'd', modelName: 'model-d', kind: 'voice' }),
];

describe('findProblemsInTaskModels', () => {
  it('accepts active and deprecated text models for known jobs', () => {
    expect(findProblemsInTaskModels(catalogue, { chat_reply: ['a', 'b'], summarise: ['b'] })).toEqual([]);
    expect(findProblemsInTaskModels(catalogue, {})).toEqual([]);
  });

  it('names each problem: unknown job, unknown model, retired, voice, repeated', () => {
    const problems = findProblemsInTaskModels(catalogue, {
      not_a_job: ['a'],
      chat_reply: ['zzz', 'c', 'd', 'a', 'a'],
    });
    expect(problems).toEqual([
      '"not_a_job" is not a job the AI does',
      'chat_reply: the same model is listed twice',
      'chat_reply: there is no model with the id zzz',
      'chat_reply: model-c is retired and cannot be used',
      'chat_reply: model-d is a voice model and cannot do this job',
    ]);
  });
});
