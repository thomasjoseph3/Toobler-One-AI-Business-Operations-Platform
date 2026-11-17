import { describe, expect, it } from 'vitest';
import { buildCreateTicketRequest, checkTicketForm, EMPTY_TICKET_FORM } from './ticket-form';
import { buildTicketsPath, DEFAULT_TICKETS_VIEW, describeTicketOwner, isTicketsViewFiltered, readTicketsView, writeTicketsView } from './tickets-view';

describe('the tickets view in the web address', () => {
  it('starts with open tickets, and falls back to that for anything not understood', () => {
    expect(readTicketsView(new URLSearchParams(''))).toEqual(DEFAULT_TICKETS_VIEW);
    expect(readTicketsView(new URLSearchParams('status=nonsense&owner=x&type=y&priority=z&page=0'))).toEqual(DEFAULT_TICKETS_VIEW);
  });

  it('reads and writes every filter, leaving out the defaults', () => {
    const view = readTicketsView(new URLSearchParams('status=done&owner=me&type=complaint&priority=urgent&page=2'));
    expect(view).toEqual({ status: 'done', owner: 'me', type: 'complaint', priority: 'urgent', page: 2 });
    expect(writeTicketsView(view).toString()).toBe('status=done&owner=me&type=complaint&priority=urgent&page=2');
    expect(writeTicketsView(DEFAULT_TICKETS_VIEW).toString()).toBe('');
    expect(readTicketsView(new URLSearchParams('status=all')).status).toBe('all');
  });

  it('builds the API address, naming the owner filter as the API does', () => {
    expect(buildTicketsPath(DEFAULT_TICKETS_VIEW)).toBe('/tickets?status=open&page=1&limit=25');
    expect(buildTicketsPath({ status: 'all', owner: 'unassigned', type: 'callback', priority: 'high', page: 3 })).toBe(
      '/tickets?ownerUserId=unassigned&type=callback&priority=high&page=3&limit=25',
    );
  });

  it('knows when a filter is on, and who owns a ticket', () => {
    expect(isTicketsViewFiltered(DEFAULT_TICKETS_VIEW)).toBe(false);
    expect(isTicketsViewFiltered({ ...DEFAULT_TICKETS_VIEW, status: 'done' })).toBe(true);
    expect(describeTicketOwner({ ownerUserId: null }, 'u1')).toBe('nobody');
    expect(describeTicketOwner({ ownerUserId: 'u1' }, 'u1')).toBe('you');
    expect(describeTicketOwner({ ownerUserId: 'u2' }, 'u1')).toBe('teamMember');
  });
});

describe('the Add ticket form', () => {
  it('needs a person and a title', () => {
    expect(checkTicketForm(EMPTY_TICKET_FORM)).toEqual({ contact: 'tickets.form.needContact', title: 'tickets.form.needTitle' });
    expect(checkTicketForm({ ...EMPTY_TICKET_FORM, contactId: 'c1', title: '   ' }).title).toBe('tickets.form.needTitle');
    expect(checkTicketForm({ ...EMPTY_TICKET_FORM, contactId: 'c1', title: 'Wrong bill' })).toEqual({});
  });

  it('refuses texts that are too long', () => {
    const base = { ...EMPTY_TICKET_FORM, contactId: 'c1', title: 'x' };
    expect(checkTicketForm({ ...base, title: 'x'.repeat(201) }).title).toBe('tickets.form.titleTooLong');
    expect(checkTicketForm({ ...base, details: 'x'.repeat(2001) }).details).toBe('tickets.form.detailsTooLong');
  });

  it('builds the request, trimming and leaving out empty details', () => {
    expect(buildCreateTicketRequest({ ...EMPTY_TICKET_FORM, title: ' Wrong bill ', type: 'complaint', priority: 'high' }, 'c1')).toEqual({
      contactId: 'c1',
      title: 'Wrong bill',
      type: 'complaint',
      priority: 'high',
    });
    expect(buildCreateTicketRequest({ ...EMPTY_TICKET_FORM, title: 'a', details: ' more ' }, 'c1').details).toBe('more');
  });
});
