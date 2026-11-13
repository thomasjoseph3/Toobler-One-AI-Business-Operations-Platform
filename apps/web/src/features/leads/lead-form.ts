// The rules of the Create lead form: reading what was typed, checking it, and turning it into what the API takes.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { CreateContactRequest, CreateLeadRequest, Lead, UpdateLeadRequest } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

/** The most the API accepts for a budget, in paise (one lakh crore rupees). */
const MAX_BUDGET_PAISE = 1_000_000_000_000;

/** Turns what was typed in the budget box ("45000", "1,20,000", "₹4500.50") into paise, or says it is not an amount. Blank means no budget. */
export function parseRupeesToPaise(typedText: string): { isValid: true; paise: number | null } | { isValid: false } {
  const cleanedText = typedText.replace(/[₹,\s]/g, '');
  if (cleanedText === '') return { isValid: true, paise: null };
  if (!/^\d+(\.\d{1,2})?$/.test(cleanedText)) return { isValid: false };
  const paise = Math.round(Number(cleanedText) * 100);
  return paise > MAX_BUDGET_PAISE ? { isValid: false } : { isValid: true, paise };
}

/** How many minutes the time zone is ahead of UTC at this moment (Asia/Kolkata is +330). */
function readOffsetMinutes(instantInMilliseconds: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantInMilliseconds));
  const readPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    readPart('year'),
    readPart('month') - 1,
    readPart('day'),
    readPart('hour'),
    readPart('minute'),
    readPart('second'),
  );
  return (wallClockAsUtc - Math.floor(instantInMilliseconds / 1000) * 1000) / 60_000;
}

/**
 * Turns the date and time typed in a date-time box ("2026-11-22T10:00") into the UTC moment it means in the BUSINESS's time
 * zone, which is not always the zone of the browser. Returns null when the text is not a real date and time. The offset is
 * worked out twice so a date near a daylight-saving change still comes out right.
 */
export function convertBusinessLocalTimeToUtc(localDateTime: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const asDate = new Date(wallClockAsUtc);
  const isRealDate =
    asDate.getUTCFullYear() === year &&
    asDate.getUTCMonth() === month - 1 &&
    asDate.getUTCDate() === day &&
    asDate.getUTCHours() === hour &&
    asDate.getUTCMinutes() === minute;
  if (!isRealDate) return null;
  const firstGuess = wallClockAsUtc - readOffsetMinutes(wallClockAsUtc, timeZone) * 60_000;
  const correctedGuess = wallClockAsUtc - readOffsetMinutes(firstGuess, timeZone) * 60_000;
  return new Date(correctedGuess).toISOString();
}

/** The details of a lead, as the text boxes hold them: used by the Create lead form and by editing a lead on its own page. */
export interface LeadDetailsFields {
  interest: string;
  dateFrom: string;
  dateTo: string;
  partySize: string;
  budget: string;
  /** From a date-time box: "2026-11-22T10:00", in the business's time zone. */
  callbackAt: string;
  /** What the business promised the customer (only edited on the lead page). */
  promise: string;
}

/** Everything typed in the Create lead form, as the text boxes hold it. */
export interface LeadFormFields extends LeadDetailsFields {
  /** `existing` = a person found by searching; `new` = a person typed in now. */
  personMode: 'existing' | 'new';
  existingContactId: string | null;
  newName: string;
  newPhone: string;
  newEmail: string;
}

/** The empty form. */
export const EMPTY_LEAD_FORM: LeadFormFields = {
  personMode: 'existing',
  existingContactId: null,
  newName: '',
  newPhone: '',
  newEmail: '',
  interest: '',
  dateFrom: '',
  dateTo: '',
  partySize: '',
  budget: '',
  callbackAt: '',
  promise: '',
};

/** The fields that can have a problem, and the message for each (as a text key, so the words stay in one file). */
export type LeadFormProblems = Partial<
  Record<'person' | 'newName' | 'newContact' | 'dateTo' | 'partySize' | 'budget' | 'callbackAt', MessageKey>
>;

/** The problems in the details part of a form (dates, party size, budget, callback). Used by Create lead and by editing a lead. */
export function checkLeadDetails(fields: LeadDetailsFields, timeZone: string): LeadFormProblems {
  const problems: LeadFormProblems = {};
  if (fields.dateFrom !== '' && fields.dateTo !== '' && fields.dateTo < fields.dateFrom) {
    problems.dateTo = 'leadForm.problem.dateOrder';
  }
  if (fields.partySize.trim() !== '') {
    const partySize = Number(fields.partySize);
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 10_000)
      problems.partySize = 'leadForm.problem.partySize';
  }
  if (!parseRupeesToPaise(fields.budget).isValid) problems.budget = 'leadForm.problem.budget';
  if (fields.callbackAt !== '' && convertBusinessLocalTimeToUtc(fields.callbackAt, timeZone) === null) {
    problems.callbackAt = 'leadForm.problem.callbackAt';
  }
  return problems;
}

/**
 * Checks the Create lead form on the device before anything is sent, with plain messages. A person is needed (found by
 * searching, or a new one with a name and a phone or an email). The other fields are optional but must make sense when filled in.
 */
export function checkLeadForm(fields: LeadFormFields, timeZone: string): LeadFormProblems {
  const problems: LeadFormProblems = {};
  if (fields.personMode === 'existing') {
    if (fields.existingContactId === null) problems.person = 'leadForm.problem.person';
  } else {
    if (fields.newName.trim() === '') problems.newName = 'leadForm.problem.name';
    if (fields.newPhone.trim() === '' && fields.newEmail.trim() === '')
      problems.newContact = 'leadForm.problem.phoneOrEmail';
  }
  return { ...problems, ...checkLeadDetails(fields, timeZone) };
}

/** What to send to `POST /contacts` for a new person: only the boxes that were filled in. */
export function buildContactRequest(fields: LeadFormFields): CreateContactRequest {
  return {
    name: fields.newName.trim(),
    ...(fields.newPhone.trim() === '' ? {} : { phone: fields.newPhone.trim() }),
    ...(fields.newEmail.trim() === '' ? {} : { email: fields.newEmail.trim() }),
  } as CreateContactRequest;
}

/** What to send to `POST /leads`: the person, and only the boxes that were filled in. The owner is left to the business's sharing rule. */
export function buildLeadRequest(fields: LeadFormFields, contactId: string, timeZone: string): CreateLeadRequest {
  const budget = parseRupeesToPaise(fields.budget);
  const callbackAt = fields.callbackAt === '' ? null : convertBusinessLocalTimeToUtc(fields.callbackAt, timeZone);
  return {
    contactId,
    ...(fields.interest.trim() === '' ? {} : { interest: fields.interest.trim() }),
    ...(fields.dateFrom === '' ? {} : { dateFrom: fields.dateFrom }),
    ...(fields.dateTo === '' ? {} : { dateTo: fields.dateTo }),
    ...(fields.partySize.trim() === '' ? {} : { partySize: Number(fields.partySize) }),
    ...(budget.isValid && budget.paise !== null ? { budgetPaise: budget.paise } : {}),
    ...(callbackAt === null ? {} : { callbackAt }),
  } as CreateLeadRequest;
}

/** Turns a number of paise into what the budget box shows: "45000", or "4500.50" when there are paise. Blank for no budget. */
export function formatPaiseAsRupees(paise: number | null): string {
  if (paise === null) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/**
 * Turns a UTC moment ("2026-11-22T04:30:00.000Z") into what a date-time box shows ("2026-11-22T10:00") in the BUSINESS's time
 * zone: the opposite of `convertBusinessLocalTimeToUtc`. Blank for no moment.
 */
export function formatUtcAsBusinessLocalTime(utcMoment: string | null, timeZone: string): string {
  if (utcMoment === null) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMoment));
  const readPart = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${readPart('year')}-${readPart('month')}-${readPart('day')}T${readPart('hour')}:${readPart('minute')}`;
}

/** The details of a lead as the edit form's text boxes hold them. */
export function leadToDetailsFields(lead: Lead, timeZone: string): LeadDetailsFields {
  return {
    interest: lead.interest ?? '',
    dateFrom: lead.dateFrom ?? '',
    dateTo: lead.dateTo ?? '',
    partySize: lead.partySize === null ? '' : String(lead.partySize),
    budget: formatPaiseAsRupees(lead.budgetPaise),
    callbackAt: formatUtcAsBusinessLocalTime(lead.callbackAt, timeZone),
    promise: lead.promise ?? '',
  };
}

/**
 * What to send to `PATCH /leads/{id}` after editing: ONLY the fields that were changed, so nothing else is touched (the callback
 * keeps its seconds unless the person changes it). A box that was emptied is sent as `null`, which clears the field.
 */
export function buildLeadChanges(original: Lead, edited: LeadDetailsFields, timeZone: string): UpdateLeadRequest {
  const before = leadToDetailsFields(original, timeZone);
  const changes: Record<string, string | number | null> = {};
  const textOrNothing = (text: string) => (text.trim() === '' ? null : text.trim());
  if (edited.interest.trim() !== before.interest.trim()) changes.interest = textOrNothing(edited.interest);
  if (edited.dateFrom !== before.dateFrom) changes.dateFrom = edited.dateFrom === '' ? null : edited.dateFrom;
  if (edited.dateTo !== before.dateTo) changes.dateTo = edited.dateTo === '' ? null : edited.dateTo;
  if (edited.partySize.trim() !== before.partySize) {
    changes.partySize = edited.partySize.trim() === '' ? null : Number(edited.partySize);
  }
  const budget = parseRupeesToPaise(edited.budget);
  if (budget.isValid && budget.paise !== original.budgetPaise) changes.budgetPaise = budget.paise;
  if (edited.callbackAt !== before.callbackAt) {
    changes.callbackAt = edited.callbackAt === '' ? null : convertBusinessLocalTimeToUtc(edited.callbackAt, timeZone);
  }
  if (edited.promise.trim() !== before.promise.trim()) changes.promise = textOrNothing(edited.promise);
  return changes as UpdateLeadRequest;
}
