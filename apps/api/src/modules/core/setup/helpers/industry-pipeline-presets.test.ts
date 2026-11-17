import { describe, expect, it } from 'vitest';
import { INDUSTRY_PIPELINE_PRESETS, planStagePreset, STANDARD_OPEN_STAGE_NAMES } from './industry-pipeline-presets';

const standardStages = [
  { id: 'a', name: 'New' },
  { id: 'b', name: 'Contacted' },
  { id: 'c', name: 'Quoted' },
];

describe('planStagePreset', () => {
  it("renames the three standard stages to the industry's words, keeping the ids", () => {
    const plan = planStagePreset('hotel_resort', standardStages);
    expect(plan.rename).toEqual([
      { stageId: 'a', from: 'New', to: 'New enquiry' },
      { stageId: 'b', from: 'Contacted', to: 'Called' },
      { stageId: 'c', from: 'Quoted', to: 'Rate sent' },
    ]);
    expect(plan.leftAlone).toEqual([]);
  });

  it('never touches a stage the owner has already changed, and never adds or removes one', () => {
    const plan = planStagePreset('hotel_resort', [
      { id: 'a', name: 'Fresh leads' },
      { id: 'b', name: 'Contacted' },
      { id: 'c', name: 'Quoted' },
      { id: 'd', name: 'Visited' },
    ]);
    expect(plan.rename.map((rename) => rename.stageId)).toEqual(['b', 'c']);
    expect(plan.leftAlone).toEqual(['Fresh leads']);
  });

  it('changes nothing the second time', () => {
    const afterFirst = [
      { id: 'a', name: 'New enquiry' },
      { id: 'b', name: 'Called' },
      { id: 'c', name: 'Rate sent' },
    ];
    expect(planStagePreset('hotel_resort', afterFirst)).toEqual({ rename: [], leftAlone: [] });
  });

  it('leaves a stage alone when its new word is already used by another stage', () => {
    const plan = planStagePreset('hotel_resort', [
      { id: 'a', name: 'New' },
      { id: 'b', name: 'Contacted' },
      { id: 'c', name: 'Quoted' },
      { id: 'd', name: 'rate sent' },
    ]);
    expect(plan.rename.map((rename) => rename.to)).toEqual(['New enquiry', 'Called']);
    expect(plan.leftAlone).toEqual(['Quoted']);
  });

  it('changes nothing for general, other and an industry nobody wrote words for', () => {
    for (const industry of ['general', 'other', 'made_up_industry']) {
      expect(planStagePreset(industry, standardStages)).toEqual({ rename: [], leftAlone: [] });
    }
  });

  it('copes with a business that has fewer open stages than three', () => {
    expect(planStagePreset('clinic', [{ id: 'a', name: 'New' }]).rename).toEqual([
      { stageId: 'a', from: 'New', to: 'New enquiry' },
    ]);
  });
});

describe('the industry words', () => {
  it('give three words each, and none repeats within an industry', () => {
    for (const [industry, names] of Object.entries(INDUSTRY_PIPELINE_PRESETS)) {
      expect(names, industry).toHaveLength(STANDARD_OPEN_STAGE_NAMES.length);
      expect(new Set(names.map((name) => name.toLowerCase())).size, industry).toBe(3);
      for (const name of names) expect(name.length, `${industry}: ${name}`).toBeLessThanOrEqual(60);
    }
  });
});
