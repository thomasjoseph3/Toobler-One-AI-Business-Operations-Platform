// The rules of the Add ticket form: checking what was typed and turning it into what the API takes.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { CreateTicketRequest, Ticket, TicketPriority, TicketType, UpdateTicketRequest } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

/** Everything chosen or typed in the Add ticket form. */
export interface TicketFormFields {
  /** The person the ticket is about, chosen by searching; null until one is chosen. */
  contactId: string | null;
  title: string;
  details: string;
  type: TicketType;
  priority: TicketPriority;
}

export const EMPTY_TICKET_FORM: TicketFormFields = {
  contactId: null,
  title: '',
  details: '',
  type: 'other',
  priority: 'normal',
};

/** The longest title and details the API accepts. */
export const MAX_TITLE_LENGTH = 200;
export const MAX_DETAILS_LENGTH = 2000;

/** What is wrong with the form, as the words to show under the box. A box that is fine has no entry. */
export interface TicketFormProblems {
  contact?: MessageKey;
  title?: MessageKey;
  details?: MessageKey;
}

/** Checks the form on the device first: a person and a title are needed, and the texts must fit. */
export function checkTicketForm(fields: TicketFormFields): TicketFormProblems {
  const problems: TicketFormProblems = {};
  if (fields.contactId === null) problems.contact = 'tickets.form.needContact';
  if (fields.title.trim() === '') problems.title = 'tickets.form.needTitle';
  else if (fields.title.trim().length > MAX_TITLE_LENGTH) problems.title = 'tickets.form.titleTooLong';
  if (fields.details.trim().length > MAX_DETAILS_LENGTH) problems.details = 'tickets.form.detailsTooLong';
  return problems;
}

/** Turns the checked form into the request body; empty details are left out. Call it only after `checkTicketForm` found nothing. */
export function buildCreateTicketRequest(fields: TicketFormFields, contactId: string): CreateTicketRequest {
  const request: CreateTicketRequest = {
    contactId,
    title: fields.title.trim(),
    type: fields.type,
    priority: fields.priority,
  };
  if (fields.details.trim() !== '') request.details = fields.details.trim();
  return request;
}

/** What can be changed on a ticket's own page, as the boxes hold it (the person it is about never changes). */
export interface TicketEditFields {
  title: string;
  details: string;
  type: TicketType;
  priority: TicketPriority;
}

/** Fills the edit form with what the ticket has now. */
export function ticketToEditFields(ticket: Ticket): TicketEditFields {
  return { title: ticket.title, details: ticket.details ?? '', type: ticket.type, priority: ticket.priority };
}

/** Checks the edit form on the device first: the title cannot be empty, and the texts must fit. */
export function checkTicketEditForm(fields: TicketEditFields): TicketFormProblems {
  const problems: TicketFormProblems = {};
  if (fields.title.trim() === '') problems.title = 'tickets.form.needTitle';
  else if (fields.title.trim().length > MAX_TITLE_LENGTH) problems.title = 'tickets.form.titleTooLong';
  if (fields.details.trim().length > MAX_DETAILS_LENGTH) problems.details = 'tickets.form.detailsTooLong';
  return problems;
}

/** Turns the edit form into the request body with only what changed; emptied details are sent as null (clear them). An empty body means nothing changed. */
export function buildUpdateTicketRequest(fields: TicketEditFields, ticket: Ticket): UpdateTicketRequest {
  const request: UpdateTicketRequest = {};
  if (fields.title.trim() !== ticket.title) request.title = fields.title.trim();
  if (fields.details.trim() !== (ticket.details ?? ''))
    request.details = fields.details.trim() === '' ? null : fields.details.trim();
  if (fields.type !== ticket.type) request.type = fields.type;
  if (fields.priority !== ticket.priority) request.priority = fields.priority;
  return request;
}

/** Checks a note before it is sent: it cannot be empty (the API would ignore it) or too long. */
export function checkNote(noteText: string): MessageKey | null {
  if (noteText.trim() === '') return 'ticketPage.notes.needText';
  if (noteText.trim().length > MAX_DETAILS_LENGTH) return 'ticketPage.notes.tooLong';
  return null;
}
