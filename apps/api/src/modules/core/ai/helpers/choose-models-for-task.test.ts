import { describe, expect, it } from 'vitest';
import {
  buildCandidates,
  chooseModelsForTask,
  chooseOrderForTask,
  type CatalogueModel,
} from './choose-models-for-task';

const model = (overrides: Partial<CatalogueModel> & Pick<CatalogueModel, 'modelName'>): CatalogueModel => ({
  id: `id-${overrides.modelName}`,
  label: `Label ${overrides.modelName}`,
  provider: 'gemini',
  tasks: ['chat_reply', 'classify_conversation'],
  status: 'active',
  kind: 'text',
  size: 'small',
  isAlias: false,
  retiresOn: null,
  sortOrder: 100,
  ...overrides,
});
const bothProviders = new Set(['gemini', 'openai'] as const);

describe('chooseModelsForTask', () => {
  const flash = model({ modelName: 'flash' });
  const flashLite = model({ modelName: 'flash-lite' });
  const gptMini = model({ modelName: 'gpt-mini', provider: 'openai' });
  const catalogue = [flash, flashLite, gptMini];
  const namesOf = (chosen: CatalogueModel[]) => chosen.map((chosenModel) => chosenModel.modelName);

  it("keeps the job's own order, not the catalogue's", () => {
    const chosen = chooseModelsForTask({
      catalogue,
      orderedModelIds: [gptMini.id, flash.id, flashLite.id],
      providersWithKeys: bothProviders,
    });
    expect(namesOf(chosen)).toEqual(['gpt-mini', 'flash', 'flash-lite']);
  });

  it('gives each job its own models', () => {
    const forSorting = chooseModelsForTask({
      catalogue,
      orderedModelIds: [flashLite.id],
      providersWithKeys: bothProviders,
    });
    const forSetup = chooseModelsForTask({
      catalogue,
      orderedModelIds: [flash.id, gptMini.id],
      providersWithKeys: bothProviders,
    });
    expect(namesOf(forSorting)).toEqual(['flash-lite']);
    expect(namesOf(forSetup)).toEqual(['flash', 'gpt-mini']);
  });

  it('leaves out a company with no key', () => {
    const chosen = chooseModelsForTask({
      catalogue,
      orderedModelIds: [flash.id, gptMini.id],
      providersWithKeys: new Set(['openai']),
    });
    expect(namesOf(chosen)).toEqual(['gpt-mini']);
  });

  it('puts deprecated models behind the active ones and never uses retired ones', () => {
    const old = model({ modelName: 'old', status: 'deprecated' });
    const gone = model({ modelName: 'gone', status: 'retired' });
    const chosen = chooseModelsForTask({
      catalogue: [old, gone, flash, flashLite],
      orderedModelIds: [old.id, gone.id, flash.id, flashLite.id],
      providersWithKeys: bothProviders,
    });
    expect(namesOf(chosen)).toEqual(['flash', 'flash-lite', 'old']);
  });

  it('uses text models only (a voice model cannot answer a text job)', () => {
    const talker = model({ modelName: 'live-voice', kind: 'voice' });
    const chosen = chooseModelsForTask({
      catalogue: [talker, flash],
      orderedModelIds: [talker.id, flash.id],
      providersWithKeys: bothProviders,
    });
    expect(namesOf(chosen)).toEqual(['flash']);
  });

  it('ignores an id that is not in the catalogue, and gives nothing when nothing fits', () => {
    expect(
      namesOf(
        chooseModelsForTask({ catalogue, orderedModelIds: ['missing', flash.id], providersWithKeys: bothProviders }),
      ),
    ).toEqual(['flash']);
    expect(chooseModelsForTask({ catalogue, orderedModelIds: [], providersWithKeys: bothProviders })).toEqual([]);
    expect(
      chooseModelsForTask({ catalogue: [], orderedModelIds: [flash.id], providersWithKeys: bothProviders }),
    ).toEqual([]);
  });
});

describe('buildCandidates', () => {
  it('tries every key on the first model, then every key on the next', () => {
    const models = [model({ modelName: 'flash' }), model({ modelName: 'gpt-mini', provider: 'openai' })];
    const candidates = buildCandidates({
      models,
      keySource: 'platform',
      keysFor: (provider) =>
        provider === 'gemini'
          ? [
              { key: 'g2', position: 2 },
              { key: 'g1', position: 1 },
            ]
          : [{ key: 'o1', position: 1 }],
    });
    expect(candidates.map((candidate) => `${candidate.modelName}#${candidate.keyPosition}`)).toEqual([
      'flash#2',
      'flash#1',
      'gpt-mini#1',
    ]);
    expect(candidates.every((candidate) => candidate.keySource === 'platform')).toBe(true);
  });

  it('gives nothing for a company with no keys', () => {
    expect(
      buildCandidates({ models: [model({ modelName: 'flash' })], keySource: 'platform', keysFor: () => [] }),
    ).toEqual([]);
  });
});

describe('chooseOrderForTask', () => {
  const platformOrderPerTask = new Map([
    ['chat_reply', ['p1', 'p2']],
    ['summarise', ['p3']],
  ]);

  it("uses the business's own order for the jobs it set, and the platform's for the rest", () => {
    const businessTaskModels = { chat_reply: ['mine'] };
    expect(chooseOrderForTask({ businessTaskModels, platformOrderPerTask, taskId: 'chat_reply' })).toEqual(['mine']);
    expect(chooseOrderForTask({ businessTaskModels, platformOrderPerTask, taskId: 'summarise' })).toEqual(['p3']);
  });

  it('gives nothing for a job nobody has set', () => {
    expect(chooseOrderForTask({ businessTaskModels: {}, platformOrderPerTask, taskId: 'unknown' })).toEqual([]);
  });
});
