import type {
  CreateOfferingRequest,
  GstMode,
  Offering,
  OfferingDetail,
  SuggestedOffering,
  UpdateOfferingRequest,
} from '@toobler-one/shared';
import { paiseToRupeesText, rupeesTextToPaise } from '../knowledge/answer-draft';

// The form for adding or changing something the business sells, and how it turns into what the API takes. Pure: no screen, no network.
// Money is typed as rupees and sent as whole paise. The API checks everything again; these checks give quick, friendly messages.

export interface OfferingFormFields {
  name: string;
  description: string;
  /** True when the business shares a price: then the price, its unit and its GST note are all needed. */
  sharesPrice: boolean;
  priceRupees: string;
  priceUnit: string;
  gstMode: GstMode | '';
  seasonNote: string;
  includes: string;
  details: Array<{ label: string; value: string }>;
  active: boolean;
}

/** What is wrong with the form, by field. A field that is fine is absent. */
export type OfferingFormProblems = Partial<Record<'name' | 'price' | 'priceUnit' | 'gstMode' | 'details', string>>;

export const EMPTY_OFFERING_FORM: OfferingFormFields = {
  name: '',
  description: '',
  sharesPrice: false,
  priceRupees: '',
  priceUnit: 'per night',
  gstMode: '',
  seasonNote: '',
  includes: '',
  details: [],
  active: true,
};

/** The form filled from an offering that already exists. */
export function formFromOffering(offering: Offering): OfferingFormFields {
  return {
    name: offering.name,
    description: offering.description ?? '',
    sharesPrice: offering.fromPricePaise !== null,
    priceRupees: offering.fromPricePaise === null ? '' : paiseToRupeesText(offering.fromPricePaise),
    priceUnit: offering.priceUnit ?? 'per night',
    gstMode: offering.gstMode ?? '',
    seasonNote: offering.seasonNote ?? '',
    includes: offering.includes ?? '',
    details: offering.details.map((detail) => ({ label: detail.label, value: detail.value })),
    active: offering.active,
  };
}

/** The form filled from something the website seems to sell. The unit and GST note are left for the owner to choose: nothing is guessed. */
export function formFromSuggestion(suggestion: SuggestedOffering): OfferingFormFields {
  return {
    ...EMPTY_OFFERING_FORM,
    name: suggestion.name,
    description: suggestion.description ?? '',
    sharesPrice: suggestion.fromPricePaise !== null,
    priceRupees: suggestion.fromPricePaise === null ? '' : paiseToRupeesText(suggestion.fromPricePaise),
    priceUnit: '',
  };
}

/** Checks the form. A price needs a number, a unit and a GST note, or none of the three. */
export function checkOfferingForm(fields: OfferingFormFields): OfferingFormProblems {
  const problems: OfferingFormProblems = {};
  if (fields.name.trim() === '') problems.name = 'Give it a name.';
  if (fields.sharesPrice) {
    if (rupeesTextToPaise(fields.priceRupees) === null) problems.price = 'Use a price like 4500.';
    if (fields.priceUnit.trim() === '') problems.priceUnit = 'Say what the price is for, like per night.';
    if (fields.gstMode === '') problems.gstMode = 'Say whether the price includes GST.';
  }
  const incompleteDetail = fields.details.some(
    (detail) => (detail.label.trim() === '') !== (detail.value.trim() === ''),
  );
  if (incompleteDetail) problems.details = 'Give each detail a name and a value, or remove it.';
  return problems;
}

/** The details with empty rows left out. */
function cleanDetails(details: OfferingFormFields['details']): OfferingDetail[] {
  return details
    .map((detail) => ({ label: detail.label.trim(), value: detail.value.trim() }))
    .filter((detail) => detail.label !== '' && detail.value !== '');
}

/** What `POST /offerings` takes. Only what was filled in is sent. */
export function buildCreateRequest(fields: OfferingFormFields): CreateOfferingRequest {
  const request: CreateOfferingRequest = { name: fields.name.trim(), active: fields.active };
  if (fields.description.trim() !== '') request.description = fields.description.trim();
  if (fields.sharesPrice) {
    request.fromPricePaise = rupeesTextToPaise(fields.priceRupees) ?? 0;
    request.priceUnit = fields.priceUnit.trim();
    request.gstMode = fields.gstMode as GstMode;
  }
  if (fields.seasonNote.trim() !== '') request.seasonNote = fields.seasonNote.trim();
  if (fields.includes.trim() !== '') request.includes = fields.includes.trim();
  const details = cleanDetails(fields.details);
  if (details.length > 0) request.details = details;
  return request;
}

/**
 * What `PATCH /offerings/{id}` takes: only what changed from the offering as it was. Taking the price away sends `fromPricePaise: null`;
 * adding or changing a price sends all three (price, unit, GST note) because the API needs them together. Empty when nothing changed.
 */
export function buildUpdateRequest(original: Offering, fields: OfferingFormFields): UpdateOfferingRequest {
  const request: UpdateOfferingRequest = {};
  if (fields.name.trim() !== original.name) request.name = fields.name.trim();
  if (fields.description.trim() !== (original.description ?? ''))
    request.description = fields.description.trim() === '' ? null : fields.description.trim();
  if (fields.seasonNote.trim() !== (original.seasonNote ?? ''))
    request.seasonNote = fields.seasonNote.trim() === '' ? null : fields.seasonNote.trim();
  if (fields.includes.trim() !== (original.includes ?? ''))
    request.includes = fields.includes.trim() === '' ? null : fields.includes.trim();
  if (fields.active !== original.active) request.active = fields.active;

  if (!fields.sharesPrice) {
    if (original.fromPricePaise !== null) request.fromPricePaise = null;
  } else {
    const paise = rupeesTextToPaise(fields.priceRupees);
    const priceChanged =
      paise !== original.fromPricePaise ||
      fields.priceUnit.trim() !== (original.priceUnit ?? '') ||
      fields.gstMode !== (original.gstMode ?? '');
    if (priceChanged) {
      request.fromPricePaise = paise ?? 0;
      request.priceUnit = fields.priceUnit.trim();
      request.gstMode = fields.gstMode as GstMode;
    }
  }

  const details = cleanDetails(fields.details);
  if (
    JSON.stringify(details) !==
    JSON.stringify(original.details.map((detail) => ({ label: detail.label, value: detail.value })))
  ) {
    request.details = details;
  }
  return request;
}

/** Whether a request has nothing in it (the form was opened and saved without a change). */
export function isEmptyRequest(request: object): boolean {
  return Object.keys(request).length === 0;
}
