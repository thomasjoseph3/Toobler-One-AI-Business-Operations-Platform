import { describe, expect, it } from 'vitest';
import type { AiKey, ModuleView } from '@toobler-one/shared';
import {
  buildAddKeyRequest,
  checkKeyForm,
  describeKeyStatus,
  describeModeWarning,
  describePlatformUsage,
  describeTestOutcome,
  EMPTY_KEY_FORM,
  groupKeysByProvider,
  percentOfCapUsed,
} from './ai-key-state';
import { describeModuleAction, describeModuleState, groupModulesByKind, namesOfRequirements } from './modules-state';

const key = (changes: Partial<AiKey> = {}): AiKey => ({
  id: '0191f0a0-0000-7000-8000-000000000001',
  provider: 'gemini',
  label: 'Main',
  keyPreview: '••••3f9a',
  status: 'unchecked',
  statusNote: null,
  statusCheckedAt: null,
  createdAt: '2026-11-17T10:00:00.000Z',
  ...changes,
});

describe('checkKeyForm', () => {
  it('accepts a label and a long single-word key', () => {
    expect(checkKeyForm({ provider: 'gemini', label: 'Main key', key: 'AIzaSyExampleKeyExample1234567890' })).toEqual({});
  });

  it('asks for what is missing and says what is wrong in plain words', () => {
    expect(Object.keys(checkKeyForm(EMPTY_KEY_FORM)).sort()).toEqual(['key', 'label']);
    expect(checkKeyForm({ ...EMPTY_KEY_FORM, label: 'x', key: 'two words here that are long enough' }).key).toContain('no spaces');
    expect(checkKeyForm({ ...EMPTY_KEY_FORM, label: 'x', key: 'short' }).key).toContain('too short');
    expect(checkKeyForm({ ...EMPTY_KEY_FORM, label: 'x', key: 'k'.repeat(401) }).key).toContain('too long');
    expect(checkKeyForm({ ...EMPTY_KEY_FORM, label: 'n'.repeat(81), key: 'k'.repeat(20) }).label).toContain('80');
  });

  it('tidies the label and trims the key when building the request', () => {
    expect(buildAddKeyRequest({ provider: 'openai', label: '  Main   key ', key: '  sk-abcdefghijklmnop1234  ' })).toEqual({
      provider: 'openai',
      label: 'Main key',
      key: 'sk-abcdefghijklmnop1234',
    });
  });
});

describe('keys and tests', () => {
  it('names every key state and test outcome', () => {
    expect(describeKeyStatus('working').tone).toBe('success');
    expect(describeKeyStatus('limited').tone).toBe('warning');
    expect(describeKeyStatus('failed').tone).toBe('error');
    expect(describeKeyStatus('unchecked').tone).toBe('neutral');
    expect(describeTestOutcome('works').isGood).toBe(true);
    for (const outcome of ['rejected', 'quota', 'no_model', 'unreachable'] as const) expect(describeTestOutcome(outcome).isGood, outcome).toBe(false);
  });

  it('groups keys by company in a fixed order and leaves out companies with none', () => {
    const groups = groupKeysByProvider([key({ provider: 'anthropic' }), key({ id: 'b', provider: 'gemini' }), key({ id: 'c', provider: 'gemini' })]);
    expect(groups.map((group) => group.provider)).toEqual(['gemini', 'anthropic']);
    expect(groups[0]!.keys).toHaveLength(2);
  });
});

describe('the key mode and the platform’s part', () => {
  const access = (enabled: boolean) => ({ enabled, monthlyCallCap: null, expiresAt: null });

  it('warns when the chosen mode has nothing to use', () => {
    expect(describeModeWarning('own', access(true), 0)).toBe('settings.ai.warn.noOwnKeys');
    expect(describeModeWarning('platform', access(false), 2)).toBe('settings.ai.warn.platformOff');
    expect(describeModeWarning('own_then_platform', access(false), 0)).toBe('settings.ai.warn.nothingToUse');
    expect(describeModeWarning('own', access(false), 1)).toBeNull();
    expect(describeModeWarning('own_then_platform', access(true), 0)).toBeNull();
  });

  it('describes the platform allowance and how much is used', () => {
    expect(describePlatformUsage({ enabled: false, monthlyCallCap: null, usedThisMonth: 0, remainingThisMonth: null, expiresAt: null })).toEqual([{ key: 'settings.ai.platform.off', values: {} }]);
    expect(describePlatformUsage({ enabled: true, monthlyCallCap: 1000, usedThisMonth: 250, remainingThisMonth: 750, expiresAt: '2026-12-31' })).toEqual([
      { key: 'settings.ai.platform.cap', values: { used: 250, cap: 1000, left: 750 } },
      { key: 'settings.ai.platform.expires', values: { date: '2026-12-31' } },
    ]);
    expect(describePlatformUsage({ enabled: true, monthlyCallCap: null, usedThisMonth: 40, remainingThisMonth: null, expiresAt: null })[0]!.key).toBe('settings.ai.platform.noCap');
    expect(percentOfCapUsed({ monthlyCallCap: 1000, usedThisMonth: 250 })).toBe(25);
    expect(percentOfCapUsed({ monthlyCallCap: 1000, usedThisMonth: 5000 })).toBe(100);
    expect(percentOfCapUsed({ monthlyCallCap: null, usedThisMonth: 5 })).toBe(0);
  });
});

describe('modules', () => {
  const module = (changes: Partial<ModuleView>): ModuleView => ({ id: 'feature.x', kind: 'feature', name: 'X', description: '', requires: [], state: 'active', ...changes });

  it('groups by kind in a fixed order', () => {
    const groups = groupModulesByKind([module({ id: 'a', kind: 'feature' }), module({ id: 'b', kind: 'engine' }), module({ id: 'c', kind: 'feature' })]);
    expect(groups.map((group) => group.kind)).toEqual(['engine', 'feature']);
  });

  it('offers the right button for each state, and none when the plan does not include it', () => {
    expect(describeModuleAction('active')).toBe('switch_off');
    expect(describeModuleAction('needs_connecting')).toBe('switch_off');
    expect(describeModuleAction('off')).toBe('switch_on');
    expect(describeModuleAction('not_in_plan')).toBeNull();
    expect(describeModuleState('not_in_plan').tone).toBe('info');
    expect(describeModuleState('active').tone).toBe('success');
  });

  it('writes the names of the modules a module needs', () => {
    const leads = module({ id: 'engine.leads', name: 'Lead engine' });
    expect(namesOfRequirements(module({ requires: ['engine.leads', 'unknown.thing'] }), [leads])).toEqual(['Lead engine', 'unknown.thing']);
  });
});
