import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPANIES_VIEW } from '../companies/companies-view';
import { DEFAULT_CONTACTS_VIEW } from '../contacts/contacts-view';
import { DEFAULT_LEADS_VIEW } from '../leads/leads-view';
import {
  buildCompaniesExportRequest,
  buildContactsExportRequest,
  buildLeadsExportRequest,
  stripPaging,
} from './exports-state';

describe('the query an export sends', () => {
  it('is the list’s own query without the page, its size or the board', () => {
    expect(stripPaging('/contacts?q=a&page=3&limit=25')).toBe('q=a');
    expect(stripPaging('/leads?view=board&ownerUserId=u1')).toBe('ownerUserId=u1');
    expect(stripPaging('/contacts')).toBe('');
  });

  it('holds the contacts search, stage and conditions', () => {
    const conditions = [{ field: 'custom.car', operator: 'is' as const, value: 'Swift' }];
    const request = buildContactsExportRequest({
      ...DEFAULT_CONTACTS_VIEW,
      searchText: ' menon ',
      lifecycleStage: 'lead',
      conditions,
      page: 4,
    });
    expect(request.object).toBe('contact');
    const query = new URLSearchParams(request.query);
    expect(query.get('q')).toBe('menon');
    expect(query.get('lifecycleStage')).toBe('lead');
    expect(JSON.parse(query.get('filters')!)).toEqual(conditions);
    expect(query.has('page')).toBe(false);
  });

  it('holds the companies search and conditions', () => {
    expect(buildCompaniesExportRequest({ ...DEFAULT_COMPANIES_VIEW, searchText: 'acme' })).toEqual({
      object: 'company',
      query: 'q=acme',
    });
  });

  it('holds the leads list filters and sort, and is a list even when the board is open, with the signed-in person for "only mine"', () => {
    const request = buildLeadsExportRequest(
      { ...DEFAULT_LEADS_VIEW, layout: 'pipeline', status: 'closed', owner: 'me', sort: 'createdAt', order: 'asc' },
      'user-1',
    );
    expect(request.object).toBe('lead');
    const query = new URLSearchParams(request.query);
    expect(query.get('status')).toBe('closed');
    expect(query.get('ownerUserId')).toBe('user-1');
    expect(query.get('sort')).toBe('createdAt');
    expect(query.has('view')).toBe(false);
    expect(query.has('page')).toBe(false);
  });
});
