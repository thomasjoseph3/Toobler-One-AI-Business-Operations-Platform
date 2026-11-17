// What the Tickets list shows (status, owner, type, priority, page) and how that is kept in the web address.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { Ticket, TicketPriority, TicketStatus, TicketType } from '@toobler-one/shared';
import type { TagTone } from '@toobler-one/ui';
import type { MessageKey } from '../../app/i18n';

/** How many tickets the list shows on a page (the API's default). */
export const TICKETS_PAGE_SIZE = 25;

export const TICKET_TYPE_CHOICES: ReadonlyArray<{ type: TicketType; labelKey: MessageKey }> = [
  { type: 'callback', labelKey: 'tickets.type.callback' },
  { type: 'question', labelKey: 'tickets.type.question' },
  { type: 'complaint', labelKey: 'tickets.type.complaint' },
  { type: 'existing_customer', labelKey: 'tickets.type.existing_customer' },
  { type: 'other', labelKey: 'tickets.type.other' },
];

/** The priorities from the most to the least pressing, with the words for each. */
export const TICKET_PRIORITY_CHOICES: ReadonlyArray<{ priority: TicketPriority; labelKey: MessageKey }> = [
  { priority: 'urgent', labelKey: 'tickets.priority.urgent' },
  { priority: 'high', labelKey: 'tickets.priority.high' },
  { priority: 'normal', labelKey: 'tickets.priority.normal' },
  { priority: 'low', labelKey: 'tickets.priority.low' },
];

/** Whose tickets to show: everyone's, the signed-in person's, or the ones nobody owns. */
export type TicketsOwnerFilter = 'all' | 'me' | 'unassigned';

export interface TicketsView {
  status: TicketStatus | 'all';
  owner: TicketsOwnerFilter;
  type: TicketType | 'all';
  priority: TicketPriority | 'all';
  page: number;
}

/** The first thing staff want: what still needs doing. */
export const DEFAULT_TICKETS_VIEW: TicketsView = { status: 'open', owner: 'all', type: 'all', priority: 'all', page: 1 };

/** The words for a ticket type. */
export function findTypeLabelKey(type: TicketType): MessageKey {
  return TICKET_TYPE_CHOICES.find((choice) => choice.type === type)?.labelKey ?? 'tickets.type.other';
}

/** The words for a priority. */
export function findPriorityLabelKey(priority: TicketPriority): MessageKey {
  return TICKET_PRIORITY_CHOICES.find((choice) => choice.priority === priority)?.labelKey ?? 'tickets.priority.normal';
}

/** The tag colour for a priority. Only a hint: the word always shows beside it. */
export function findPriorityTagTone(priority: TicketPriority): TagTone {
  if (priority === 'urgent') return 'lost';
  if (priority === 'high') return 'rate-sent';
  return 'neutral';
}

/** Reads the list's view from the web address. Anything missing or not understood falls back to the default. */
export function readTicketsView(searchParams: URLSearchParams): TicketsView {
  const statusText = searchParams.get('status');
  const ownerText = searchParams.get('owner');
  const typeText = searchParams.get('type');
  const priorityText = searchParams.get('priority');
  const pageNumber = Number(searchParams.get('page'));
  return {
    status: statusText === 'all' ? 'all' : statusText === 'done' ? 'done' : 'open',
    owner: ownerText === 'me' || ownerText === 'unassigned' ? ownerText : 'all',
    type: TICKET_TYPE_CHOICES.find((choice) => choice.type === typeText)?.type ?? 'all',
    priority: TICKET_PRIORITY_CHOICES.find((choice) => choice.priority === priorityText)?.priority ?? 'all',
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

/** Writes the view into web address parameters, leaving out everything that is the default. */
export function writeTicketsView(view: TicketsView): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (view.status !== DEFAULT_TICKETS_VIEW.status) searchParams.set('status', view.status);
  if (view.owner !== 'all') searchParams.set('owner', view.owner);
  if (view.type !== 'all') searchParams.set('type', view.type);
  if (view.priority !== 'all') searchParams.set('priority', view.priority);
  if (view.page > 1) searchParams.set('page', String(view.page));
  return searchParams;
}

/** The API address for a view: `/tickets?status=open&ownerUserId=me&…&page=1&limit=25`. */
export function buildTicketsPath(view: TicketsView): string {
  const query = new URLSearchParams();
  if (view.status !== 'all') query.set('status', view.status);
  if (view.owner !== 'all') query.set('ownerUserId', view.owner);
  if (view.type !== 'all') query.set('type', view.type);
  if (view.priority !== 'all') query.set('priority', view.priority);
  query.set('page', String(view.page));
  query.set('limit', String(TICKETS_PAGE_SIZE));
  return `/tickets?${query.toString()}`;
}

/** Whether any filter differs from the first view (so an empty list means "nothing matches", not "no tickets yet"). */
export function isTicketsViewFiltered(view: TicketsView): boolean {
  return view.status !== DEFAULT_TICKETS_VIEW.status || view.owner !== 'all' || view.type !== 'all' || view.priority !== 'all';
}

/** Who owns a ticket, from the signed-in person's point of view: nobody, you, or someone else (the team list arrives with F02). */
export function describeTicketOwner(ticket: Pick<Ticket, 'ownerUserId'>, signedInUserId: string): 'nobody' | 'you' | 'teamMember' {
  if (ticket.ownerUserId === null) return 'nobody';
  return ticket.ownerUserId === signedInUserId ? 'you' : 'teamMember';
}

/** How many filters are on (the number on the Filter button): each one that differs from the first view. */
export function countActiveTicketFilters(view: TicketsView): number {
  return (
    (view.status !== DEFAULT_TICKETS_VIEW.status ? 1 : 0) +
    (view.owner !== 'all' ? 1 : 0) +
    (view.type !== 'all' ? 1 : 0) +
    (view.priority !== 'all' ? 1 : 0)
  );
}
