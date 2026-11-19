import type { SavedView } from '@toobler-one/shared';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LEADS_VIEW, type LeadsView } from './leads-view';
import {
  findActiveSavedView,
  isPlainLeadsView,
  isSameLeadsView,
  leadsViewToRequest,
  savedViewToLeadsView,
} from './saved-views';

const stageId = '0194c9a8-0000-7000-8000-000000000001';
const mineClosed: LeadsView = {
  ...DEFAULT_LEADS_VIEW,
  status: 'closed',
  stageId,
  owner: 'me',
  sort: 'createdAt',
  order: 'asc',
};

const aSavedView = (changes: Partial<SavedView> = {}): SavedView => ({
  id: 'view-1',
  object: 'lead',
  name: 'Mine',
  filters: {},
  sort: null,
  layout: 'list',
  shared: false,
  isMine: true,
  ...changes,
});

describe('leadsViewToRequest', () => {
  it('writes only the filters that differ from the plain list, with the sort and layout, and trims the name', () => {
    expect(leadsViewToRequest(mineClosed, '  Closed mine ')).toEqual({
      object: 'lead',
      name: 'Closed mine',
      filters: { status: 'closed', stageId, owner: 'me' },
      sort: { field: 'createdAt', order: 'asc' },
      layout: 'list',
    });
    expect(leadsViewToRequest(DEFAULT_LEADS_VIEW, 'All').filters).toEqual({});
  });
});

describe('savedViewToLeadsView', () => {
  it('fills in the plain list for whatever the view does not say, and starts on page 1', () => {
    expect(savedViewToLeadsView(aSavedView())).toEqual(DEFAULT_LEADS_VIEW);
    expect(
      savedViewToLeadsView(
        aSavedView({ filters: { status: 'closed', stageId, owner: 'me' }, sort: { field: 'createdAt', order: 'asc' } }),
      ),
    ).toEqual(mineClosed);
  });
  it('goes back and forth without change', () => {
    const request = leadsViewToRequest(mineClosed, 'x');
    const saved = aSavedView({ filters: request.filters, sort: request.sort, layout: request.layout });
    expect(savedViewToLeadsView(saved)).toEqual(mineClosed);
  });
});

describe('finding the active view', () => {
  it('ignores the page, and on the board ignores what the board cannot use', () => {
    expect(isSameLeadsView({ ...mineClosed, page: 4 }, mineClosed)).toBe(true);
    expect(
      isSameLeadsView(
        { ...DEFAULT_LEADS_VIEW, layout: 'pipeline', sort: 'stage' },
        { ...DEFAULT_LEADS_VIEW, layout: 'pipeline' },
      ),
    ).toBe(true);
    expect(
      isSameLeadsView(
        { ...DEFAULT_LEADS_VIEW, layout: 'pipeline', owner: 'me' },
        { ...DEFAULT_LEADS_VIEW, layout: 'pipeline' },
      ),
    ).toBe(false);
  });
  it('finds the saved view that matches the list, and none after the list was changed', () => {
    const saved = [aSavedView({ id: 'a' }), aSavedView({ id: 'b', filters: { owner: 'me' } })];
    expect(findActiveSavedView(saved, { ...DEFAULT_LEADS_VIEW, owner: 'me', page: 3 })?.id).toBe('b');
    expect(findActiveSavedView(saved, { ...DEFAULT_LEADS_VIEW, status: 'closed' })).toBeUndefined();
  });
  it('knows the plain list', () => {
    expect(isPlainLeadsView({ ...DEFAULT_LEADS_VIEW, page: 2 })).toBe(true);
    expect(isPlainLeadsView(mineClosed)).toBe(false);
  });
});
