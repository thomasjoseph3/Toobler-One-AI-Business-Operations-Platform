// The rules of the Create lead form: reading what was typed, checking it, and turning it into what the API takes.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { CreateContactRequest, CreateLeadRequest } from '@toobler-one/shared';
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

/** Everything typed in the Create lead form, as the text boxes hold it. */
export interface LeadFormFields {
  /** `existing` = a person found by searching; `new` = a person typed in now. */
  personMode: 'existing' | 'new';
  existingContactId: string | null;
  newName: string;
  newPhone: string;
  newEmail: string;
  interest: string;
  dateFrom: string;
  dateTo: string;
  partySize: string;
  budget: string;
  /** From a date-time box: "2026-11-22T10:00", in the business's time zone. */
  callbackAt: string;
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
};

/** The fields that can have a problem, and the message for each (as a text key, so the words stay in one file). */
export type LeadFormProblems = Partial<
  Record<'person' | 'newName' | 'newContact' | 'dateTo' | 'partySize' | 'budget' | 'callbackAt', MessageKey>
>;

/**
 * Checks the form on the device before anything is sent, with plain messages. A person is needed (found by searching, or a new
 * one with a name and a phone or an email). The other fields are optional but must make sense when filled in.
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
