import { describe, expect, it } from 'vitest';
import { defineModule, type ModuleManifest } from './define';
import { coreOnlyGate, createRegistry, RegistryError } from './registry';

/** Builds a small test module with only an id, a kind and (optionally) the modules it requires. */
const makeTestModule = (id: string, kind: ModuleManifest['kind'], requires?: string[]) =>
  defineModule({ id, kind, ...(requires ? { requires } : {}) });

describe('createRegistry', () => {
  it('orders modules dependencies first', () => {
    const registry = createRegistry([
      makeTestModule('engine.sales', 'engine', ['engine.leads']),
      makeTestModule('engine.leads', 'engine', ['core.contacts']),
      makeTestModule('core.contacts', 'core'),
    ]);
    expect(registry.modules.map((manifest) => manifest.id)).toEqual(['core.contacts', 'engine.leads', 'engine.sales']);
  });
  it('rejects bad ids, wrong kinds and duplicates', () => {
    expect(() => createRegistry([makeTestModule('Leads', 'engine')])).toThrow(RegistryError);
    expect(() => createRegistry([makeTestModule('engine.leads', 'channel')])).toThrow(/says it is a channel/);
    expect(() => createRegistry([makeTestModule('core.a', 'core'), makeTestModule('core.a', 'core')])).toThrow(/twice/);
  });
  it('rejects a missing dependency', () => {
    expect(() => createRegistry([makeTestModule('feature.followups', 'feature', ['engine.leads'])])).toThrow(/not registered/);
  });
  it('never lets core depend on an engine, channel or feature', () => {
    expect(() =>
      createRegistry([makeTestModule('core.contacts', 'core', ['engine.leads']), makeTestModule('engine.leads', 'engine')]),
    ).toThrow(/core never depends/);
  });
  it('rejects circular requirements', () => {
    expect(() =>
      createRegistry([makeTestModule('engine.a', 'engine', ['engine.b']), makeTestModule('engine.b', 'engine', ['engine.a'])]),
    ).toThrow(/circle/);
  });
});

describe('coreOnlyGate', () => {
  it('has core modules on and everything else off until modules arrive in F03', async () => {
    const registry = createRegistry([makeTestModule('core.contacts', 'core'), makeTestModule('engine.leads', 'engine')]);
    const gate = coreOnlyGate(registry);
    expect(await gate.isActive('a', 'core.contacts')).toBe(true);
    expect(await gate.isActive('a', 'engine.leads')).toBe(false);
    expect(await gate.isActive('a', 'engine.unknown')).toBe(false);
  });
});
