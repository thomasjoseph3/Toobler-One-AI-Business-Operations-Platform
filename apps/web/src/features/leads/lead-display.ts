// How a lead's facts are shown in the Leads list. Pure functions (no screen, no network), so each rule can be tested alone.
import type { LeadChannel, LeadContact } from '@toobler-one/shared';
import type { TagTone } from '@toobler-one/ui';
import { t, type MessageKey } from '../../app/i18n';

/**
 * The name to show for a lead: the person's name, else their phone, else their email (a caller who has not given a name yet
 * is still a real lead). A lead whose contact was deleted says so, and one with nothing at all says "Unknown contact".
 */
export function findLeadDisplayName(contact: LeadContact | null): string {
  if (contact === null) return t('leads.contactRemoved');
  return contact.name ?? contact.phone ?? contact.email ?? t('leads.unknownPerson');
}

/** The channel words for each way an enquiry can first arrive. The API's own values are kept; only the words shown are ours. */
const CHANNEL_LABEL_KEYS: Record<LeadChannel, MessageKey> = {
  manual: 'leads.source.manual',
  web_chat: 'leads.source.web_chat',
  whatsapp: 'leads.source.whatsapp',
  email: 'leads.source.email',
  phone: 'leads.source.phone',
};

/** The words for how the enquiry first arrived (the "Lead source" column). */
export function findChannelLabel(channel: LeadChannel): string {
  return t(CHANNEL_LABEL_KEYS[channel]);
}

/**
 * Who owns the lead, in words. The API gives only an id, and the team list does not exist yet (F02), so the signed-in person
 * sees "You" for their own leads and "Team member" for anyone else's. The real name arrives with F02.
 */
export function findOwnerLabel(ownerUserId: string | null, signedInUserId: string): string {
  if (ownerUserId === null) return t('leads.owner.nobody');
  return ownerUserId === signedInUserId ? t('leads.owner.you') : t('leads.owner.teamMember');
}

/** The four colours the designer gave the open stages, in pipeline order: the first open stage, the second, and so on. */
const OPEN_STAGE_TONES: readonly TagTone[] = ['new', 'contacted', 'qualified', 'rate-sent'];

/**
 * The tag colour for a stage. Stage names belong to the business, so the colour comes from the stage's kind and its place
 * among the open stages, never from its name: Won and Lost have their own colours, the first four open stages take the
 * designer's four, and any further stage is neutral.
 */
export function findStageTagTone(
  stage: { id: string; kind: 'open' | 'won' | 'lost' },
  openStageIdsInOrder: readonly string[],
): TagTone {
  if (stage.kind === 'won') return 'won';
  if (stage.kind === 'lost') return 'lost';
  const position = openStageIdsInOrder.indexOf(stage.id);
  return OPEN_STAGE_TONES[position] ?? 'neutral';
}

/** The date as "Nov 22" (month first, as the designer's Next activity chip writes it) in the business's time zone, or null when there is none. */
export function formatCallbackDate(callbackAt: string | null, timeZone: string): string | null {
  if (callbackAt === null) return null;
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone }).format(new Date(callbackAt));
}

/**
 * The moment of a lead's next activity: the earlier of its booked callback and the due time of its earliest open task, or null when it has neither.
 * Both are UTC moments written as text, so the earlier one is found by comparing them as moments.
 */
export function pickNextActivityAt(callbackAt: string | null, nextTaskDueAt: string | null | undefined): string | null {
  if (callbackAt === null) return nextTaskDueAt ?? null;
  if (nextTaskDueAt === null || nextTaskDueAt === undefined) return callbackAt;
  return new Date(nextTaskDueAt).getTime() < new Date(callbackAt).getTime() ? nextTaskDueAt : callbackAt;
}

/** The range of leads on this page as "26–50" (what the footer says is shown). Never goes past the total. */
export function describeShownRange(page: number, limit: number, total: number): string {
  if (total === 0) return '0';
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  return first === last ? String(first) : `${first}–${last}`;
}

/** A plain date like 2026-12-20 as "20 Dec 2026" (the design system's unambiguous date style), or null when there is none. */
export function formatLeadDate(plainDate: string | null): string | null {
  if (plainDate === null) return null;
  // A plain date has no time zone, so it is read as UTC and shown as UTC: it can never slip to the day before or after
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${plainDate}T00:00:00Z`),
  );
}

/** An amount in paise as rupees with Indian grouping ("₹1,20,000"), with paise only when there are some; null when there is no budget. */
export function formatBudget(budgetPaise: number | null): string | null {
  if (budgetPaise === null) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: budgetPaise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(budgetPaise / 100);
}

/** A UTC moment as "22 Nov 2026, 10:00 am" in the business's time zone, or null when there is none. */
export function formatMoment(utcMoment: string | null, timeZone: string): string | null {
  if (utcMoment === null) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(new Date(utcMoment));
}

/** The digits of a phone number for a WhatsApp link (`https://wa.me/<digits>`): the number in international form without the plus sign. */
export function toWhatsappDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}
