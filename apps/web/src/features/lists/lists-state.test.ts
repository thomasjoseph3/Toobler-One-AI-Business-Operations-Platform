import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTACTS_VIEW } from '../contacts/contacts-view';
import { contactsViewToListRequest, describeListMade } from './lists-state';

describe('contactsViewToListRequest', () => {
  it('sends only what is on in the contacts list, with the name trimmed', () => {
    expect(contactsViewToListRequest(DEFAULT_CONTACTS_VIEW, ' Everyone ')).toEqual({ name: 'Everyone', fromView: {} });
    const conditions = [{ field: 'custom.car', operator: 'is' as const, value: 'Swift' }];
    expect(
      contactsViewToListRequest(
        { searchText: ' menon ', lifecycleStage: 'lead', conditions, page: 3 },
        'Menon leads with a Swift',
      ),
    ).toEqual({
      name: 'Menon leads with a Swift',
      fromView: { q: 'menon', lifecycleStage: 'lead', filters: JSON.stringify(conditions) },
    });
  });
});

describe('describeListMade', () => {
  it('says how many contacts the list was made with', () => {
    expect(describeListMade('Diwali', 12)).toBe('The list Diwali was made with 12 contacts.');
    expect(describeListMade('Diwali', 1)).toBe('The list Diwali was made with 1 contact.');
    expect(describeListMade('Diwali', 0)).toBe('The list Diwali was made. It has no contacts yet.');
  });
});
