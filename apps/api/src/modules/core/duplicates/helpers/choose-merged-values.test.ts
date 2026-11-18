import { describe, expect, it } from 'vitest';
import type { MergeDuplicateRequest } from '@toobler-one/shared';
import { chooseMergedFields, customKeysFromMergedAway, type MergeableFields } from './choose-merged-values';

const emptyFields: MergeableFields = {
  name: null,
  phone: null,
  email: null,
  language: null,
  lifecycleStage: null,
  companyId: null,
  domain: null,
  city: null,
  ownerUserId: null,
};

describe('chooseMergedFields', () => {
  const firstRecord = { ...emptyFields, name: 'Anil Kumar', phone: '+919847012345', language: 'en' };
  const secondRecord = { ...emptyFields, name: 'Anil K', phone: '+919847012346', email: 'anil@x.com' };

  it('keeps the kept record, filling its gaps from the other', () => {
    const merged = chooseMergedFields({ a: firstRecord, b: secondRecord, request: { keep: 'a', take: {} } });
    expect(merged).toMatchObject({ name: 'Anil Kumar', phone: '+919847012345', email: 'anil@x.com', language: 'en' });
  });
  it('takes the chosen side for a field', () => {
    const merged = chooseMergedFields({
      a: firstRecord,
      b: secondRecord,
      request: { keep: 'a', take: { phone: 'b', name: 'b' } },
    });
    expect(merged).toMatchObject({ name: 'Anil K', phone: '+919847012346' });
  });
  it('respects a chosen empty value', () => {
    const merged = chooseMergedFields({
      a: firstRecord,
      b: secondRecord,
      request: { keep: 'b', take: { language: 'b' } },
    });
    expect(merged.language).toBeNull();
  });
});

describe('customKeysFromMergedAway', () => {
  it('lists the answers where the merged-away side was chosen', () => {
    const request: MergeDuplicateRequest = { keep: 'a', take: { custom: { car: 'b', city: 'a' } } };
    expect(customKeysFromMergedAway(request)).toEqual(['car']);
  });
});
