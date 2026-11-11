import { describe, expect, it } from 'vitest';
import { findCatalogueEntry, MODULE_CATALOGUE, STARTING_MODULE_IDS } from './module-catalogue';

describe('the module catalogue', () => {
  it('has well-formed ids whose first part is the kind, and no duplicates', () => {
    const ids = MODULE_CATALOGUE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of MODULE_CATALOGUE) {
      expect(entry.id).toMatch(/^[a-z]+\.[a-z_]+$/);
      expect(entry.id.startsWith(`${entry.kind}.`)).toBe(true);
    }
  });
  it('lists the eight Phase 1 modules', () => {
    expect(MODULE_CATALOGUE.map((entry) => entry.id)).toEqual([
      'engine.leads',
      'channel.webchat',
      'channel.whatsapp',
      'channel.email',
      'channel.phone',
      'feature.followups',
      'feature.assistant',
      'feature.competitors',
    ]);
  });
  it('only requires modules that exist, never itself', () => {
    for (const entry of MODULE_CATALOGUE) {
      for (const requiredId of entry.requires) {
        expect(findCatalogueEntry(requiredId), `${entry.id} requires ${requiredId}`).toBeDefined();
        expect(requiredId).not.toBe(entry.id);
      }
    }
  });
  it('starts a new business with modules that exist and need nothing else', () => {
    for (const moduleId of STARTING_MODULE_IDS) {
      expect(findCatalogueEntry(moduleId)?.requires, moduleId).toEqual([]);
    }
  });
});
