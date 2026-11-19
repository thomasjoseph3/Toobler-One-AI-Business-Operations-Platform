import { describe, expect, it } from 'vitest';
import type { Offering } from '@toobler-one/shared';
import {
  buildCreateRequest,
  buildUpdateRequest,
  checkOfferingForm,
  EMPTY_OFFERING_FORM,
  formFromOffering,
  formFromSuggestion,
  isEmptyRequest,
} from './offering-form';

const offering = (changes: Partial<Offering> = {}): Offering => ({
  id: '0191f0a0-0000-7000-8000-000000000001',
  name: 'Deluxe room',
  description: 'Sea view',
  fromPricePaise: 450000,
  priceUnit: 'per night',
  gstMode: 'plus',
  priceInWords: 'from ₹4,500 a night plus GST',
  seasonNote: null,
  includes: 'Breakfast',
  details: [{ label: 'Check-in', value: '2 PM' }],
  active: true,
  sort: 0,
  ownerUserId: null,
  createdAt: '2026-11-17T10:00:00.000Z',
  updatedAt: '2026-11-17T10:00:00.000Z',
  ...changes,
});

describe('checkOfferingForm', () => {
  it('needs only a name when no price is shared', () => {
    expect(checkOfferingForm({ ...EMPTY_OFFERING_FORM, name: 'Yoga class' })).toEqual({});
    expect(checkOfferingForm(EMPTY_OFFERING_FORM)).toEqual({ name: 'Give it a name.' });
  });

  it('needs a price, a unit and a GST note together when a price is shared', () => {
    const problems = checkOfferingForm({
      ...EMPTY_OFFERING_FORM,
      name: 'Room',
      sharesPrice: true,
      priceRupees: 'cheap',
      priceUnit: '',
      gstMode: '',
    });
    expect(Object.keys(problems).sort()).toEqual(['gstMode', 'price', 'priceUnit']);
    expect(
      checkOfferingForm({
        ...EMPTY_OFFERING_FORM,
        name: 'Room',
        sharesPrice: true,
        priceRupees: '4,500',
        gstMode: 'plus',
      }),
    ).toEqual({});
  });

  it('wants each detail to have a name and a value, or to be left empty', () => {
    expect(
      checkOfferingForm({ ...EMPTY_OFFERING_FORM, name: 'Room', details: [{ label: 'Check-in', value: '' }] }).details,
    ).toBeTruthy();
    expect(checkOfferingForm({ ...EMPTY_OFFERING_FORM, name: 'Room', details: [{ label: '', value: '' }] })).toEqual(
      {},
    );
  });
});

describe('buildCreateRequest', () => {
  it('sends only what was filled in, with the price as whole paise', () => {
    expect(buildCreateRequest({ ...EMPTY_OFFERING_FORM, name: ' Yoga class ' })).toEqual({
      name: 'Yoga class',
      active: true,
    });
    expect(
      buildCreateRequest({
        ...EMPTY_OFFERING_FORM,
        name: 'Deluxe room',
        description: 'Sea view',
        sharesPrice: true,
        priceRupees: '4,500.50',
        priceUnit: 'per night',
        gstMode: 'plus',
        includes: 'Breakfast',
        details: [
          { label: 'Check-in', value: '2 PM' },
          { label: '', value: '' },
        ],
      }),
    ).toEqual({
      name: 'Deluxe room',
      active: true,
      description: 'Sea view',
      fromPricePaise: 450050,
      priceUnit: 'per night',
      gstMode: 'plus',
      includes: 'Breakfast',
      details: [{ label: 'Check-in', value: '2 PM' }],
    });
  });
});

describe('forms from existing things', () => {
  it('fills the form from an offering, and the offering round-trips to an empty change', () => {
    const original = offering();
    expect(isEmptyRequest(buildUpdateRequest(original, formFromOffering(original)))).toBe(true);
  });

  it('fills the form from a website suggestion and leaves the unit and GST note for the owner', () => {
    const form = formFromSuggestion({ name: 'Sea view room', description: 'By the beach', fromPricePaise: 250000 });
    expect(form).toMatchObject({
      name: 'Sea view room',
      sharesPrice: true,
      priceRupees: '2500',
      priceUnit: '',
      gstMode: '',
    });
    expect(Object.keys(checkOfferingForm(form)).sort()).toEqual(['gstMode', 'priceUnit']); // the owner must choose them
    expect(formFromSuggestion({ name: 'Yoga', description: null, fromPricePaise: null }).sharesPrice).toBe(false);
  });
});

describe('buildUpdateRequest', () => {
  it('sends only the fields that changed, and clears a field emptied by the owner', () => {
    const original = offering();
    const form = { ...formFromOffering(original), name: 'Deluxe suite', description: '', active: false };
    expect(buildUpdateRequest(original, form)).toEqual({ name: 'Deluxe suite', description: null, active: false });
  });

  it('takes the price away completely when the owner stops sharing it', () => {
    const original = offering();
    expect(buildUpdateRequest(original, { ...formFromOffering(original), sharesPrice: false })).toEqual({
      fromPricePaise: null,
    });
  });

  it('sends all three together when the price changes, and nothing for a price that stays the same', () => {
    const original = offering();
    expect(buildUpdateRequest(original, { ...formFromOffering(original), priceRupees: '5000' })).toEqual({
      fromPricePaise: 500000,
      priceUnit: 'per night',
      gstMode: 'plus',
    });
    const noPrice = offering({ fromPricePaise: null, priceUnit: null, gstMode: null, priceInWords: null });
    expect(
      buildUpdateRequest(noPrice, {
        ...formFromOffering(noPrice),
        sharesPrice: true,
        priceRupees: '900',
        priceUnit: 'per person',
        gstMode: 'none',
      }),
    ).toEqual({
      fromPricePaise: 90000,
      priceUnit: 'per person',
      gstMode: 'none',
    });
  });

  it('replaces the whole details list when it changed', () => {
    const original = offering();
    expect(
      buildUpdateRequest(original, { ...formFromOffering(original), details: [{ label: 'Check-in', value: '3 PM' }] }),
    ).toEqual({
      details: [{ label: 'Check-in', value: '3 PM' }],
    });
  });
});
