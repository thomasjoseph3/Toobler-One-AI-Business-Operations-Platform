import { describe, expect, it } from 'vitest';
import type { CatalogueModel } from './choose-models-for-task';
import { chooseModelsToTestKey } from './choose-models-to-test-key';

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
const namesOf = (models: CatalogueModel[]) => models.map((chosen) => chosen.modelName);

describe('chooseModelsToTestKey', () => {
  it("tries only the key's own company, in display order, at most three", () => {
    const catalogue = [
      model({ modelName: 'a', sortOrder: 30 }),
      model({ modelName: 'b', sortOrder: 10 }),
      model({ modelName: 'c', sortOrder: 20 }),
      model({ modelName: 'd', sortOrder: 40 }),
      model({ modelName: 'gpt', provider: 'openai', sortOrder: 1 }),
    ];
    expect(namesOf(chooseModelsToTestKey(catalogue, 'gemini'))).toEqual(['b', 'c', 'a']);
    expect(namesOf(chooseModelsToTestKey(catalogue, 'openai'))).toEqual(['gpt']);
    expect(chooseModelsToTestKey(catalogue, 'anthropic')).toEqual([]);
  });

  it('puts deprecated models after active ones, and skips retired and voice models', () => {
    const catalogue = [
      model({ modelName: 'old', status: 'deprecated', sortOrder: 1 }),
      model({ modelName: 'gone', status: 'retired', sortOrder: 2 }),
      model({ modelName: 'talker', kind: 'voice', sortOrder: 3 }),
      model({ modelName: 'new', sortOrder: 50 }),
    ];
    expect(namesOf(chooseModelsToTestKey(catalogue, 'gemini'))).toEqual(['new', 'old']);
  });
});
