import { describe, expect, it } from 'vitest';
import { MODULE_CATALOGUE } from './module-catalogue';
import {
  describeModules,
  findModulesThatNeed,
  isModuleActive,
  planModuleSwitch,
  type StoredModule,
} from './module-state';

/** A stored module row, written short for the tests. */
const stored = (moduleId: string, entitled: boolean, enabled: boolean): StoredModule => ({
  moduleId,
  entitled,
  enabled,
});
const alwaysReady = () => true;

describe('describeModules', () => {
  it('lists every catalogue module, in order, and a module with no row is not in the plan', () => {
    const views = describeModules(MODULE_CATALOGUE, [], alwaysReady);
    expect(views.map((view) => view.id)).toEqual(MODULE_CATALOGUE.map((entry) => entry.id));
    expect(views.every((view) => view.state === 'not_in_plan')).toBe(true);
  });
  it('shows active, off and not in plan from the stored switches', () => {
    const views = describeModules(
      MODULE_CATALOGUE,
      [stored('engine.leads', true, true), stored('channel.webchat', true, false)],
      alwaysReady,
    );
    const stateOf = (moduleId: string) => views.find((view) => view.id === moduleId)?.state;
    expect(stateOf('engine.leads')).toBe('active');
    expect(stateOf('channel.webchat')).toBe('off');
    expect(stateOf('channel.whatsapp')).toBe('not_in_plan');
  });
  it('shows a switched-on module that is not connected as needs_connecting', () => {
    const views = describeModules(MODULE_CATALOGUE, [stored('channel.whatsapp', true, true)], () => false);
    expect(views.find((view) => view.id === 'channel.whatsapp')?.state).toBe('needs_connecting');
  });
});

describe('isModuleActive', () => {
  it('needs the plan and the switch', () => {
    expect(isModuleActive(stored('engine.leads', true, true))).toBe(true);
    expect(isModuleActive(stored('engine.leads', true, false))).toBe(false);
    expect(isModuleActive(stored('engine.leads', false, false))).toBe(false);
    expect(isModuleActive(undefined)).toBe(false);
  });
});

describe('findModulesThatNeed', () => {
  it('finds every feature that needs the lead engine, and nothing for a module nobody needs', () => {
    expect(findModulesThatNeed(MODULE_CATALOGUE, 'engine.leads').sort()).toEqual([
      'feature.assistant',
      'feature.competitors',
      'feature.followups',
    ]);
    expect(findModulesThatNeed(MODULE_CATALOGUE, 'channel.webchat')).toEqual([]);
  });
  it('follows a chain of needs', () => {
    const chain = [
      { id: 'engine.a', kind: 'engine' as const, name: 'a', description: 'a', requires: [] },
      { id: 'feature.b', kind: 'feature' as const, name: 'b', description: 'b', requires: ['engine.a'] },
      { id: 'feature.c', kind: 'feature' as const, name: 'c', description: 'c', requires: ['feature.b'] },
    ];
    expect(findModulesThatNeed(chain, 'engine.a').sort()).toEqual(['feature.b', 'feature.c']);
  });
});

describe('planModuleSwitch', () => {
  const leadsOn = stored('engine.leads', true, true);

  it('refuses to switch on a module that is not in the plan', () => {
    expect(planModuleSwitch(MODULE_CATALOGUE, [leadsOn], 'channel.whatsapp', true)).toEqual({
      allowed: false,
      reason: 'NOT_IN_PLAN',
    });
  });
  it('refuses a feature while its engine is off, and names the engine', () => {
    const plan = planModuleSwitch(
      MODULE_CATALOGUE,
      [stored('engine.leads', true, false), stored('feature.followups', true, false)],
      'feature.followups',
      true,
    );
    expect(plan).toEqual({ allowed: false, reason: 'NEEDS_MODULE', missingModuleId: 'engine.leads' });
  });
  it('switches on a module that is in the plan and has what it needs', () => {
    const plan = planModuleSwitch(
      MODULE_CATALOGUE,
      [leadsOn, stored('feature.followups', true, false)],
      'feature.followups',
      true,
    );
    expect(plan).toEqual({ allowed: true, moduleIdsToChange: ['feature.followups'] });
  });
  it('changes nothing when the module is already in the asked state', () => {
    expect(planModuleSwitch(MODULE_CATALOGUE, [leadsOn], 'engine.leads', true)).toEqual({
      allowed: true,
      moduleIdsToChange: [],
    });
    expect(
      planModuleSwitch(MODULE_CATALOGUE, [stored('channel.webchat', true, false)], 'channel.webchat', false),
    ).toEqual({
      allowed: true,
      moduleIdsToChange: [],
    });
  });
  it('switching an engine off also switches off the features that are on and need it', () => {
    const plan = planModuleSwitch(
      MODULE_CATALOGUE,
      [leadsOn, stored('feature.followups', true, true), stored('feature.assistant', true, false)],
      'engine.leads',
      false,
    );
    expect(plan).toEqual({ allowed: true, moduleIdsToChange: ['engine.leads', 'feature.followups'] });
  });
});
