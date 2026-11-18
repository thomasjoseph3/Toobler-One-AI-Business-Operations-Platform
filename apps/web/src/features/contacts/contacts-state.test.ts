import { describe, expect, it } from 'vitest';
import type { Contact } from '@toobler-one/shared';
import {
  buildCreateContactRequest,
  buildUpdateContactRequest,
  checkContactForm,
  contactToFormFields,
} from './contact-form';
import {
  buildContactsPath,
  countActiveContactFilters,
  isContactsViewFiltered,
  readContactsView,
  writeContactsView,
  DEFAULT_CONTACTS_VIEW,
} from './contacts-view';

describe('the contacts view in the web address', () => {
  it('reads a search, a stage and a page, and falls back to the default for anything else', () => {
    expect(readContactsView(new URLSearchParams('q=priya&stage=customer&page=3'))).toEqual({
      searchText: 'priya',
      lifecycleStage: 'customer',
      conditions: [],
      page: 3,
    });
    expect(readContactsView(new URLSearchParams('stage=nonsense&page=-2'))).toEqual(DEFAULT_CONTACTS_VIEW);
  });

  it('writes only what is not the default', () => {
    expect(writeContactsView(DEFAULT_CONTACTS_VIEW).toString()).toBe('');
    expect(
      writeContactsView({
        ...DEFAULT_CONTACTS_VIEW,
        searchText: ' priya ',
        lifecycleStage: 'lead',
        page: 2,
      }).toString(),
    ).toBe('q=priya&stage=lead&page=2');
  });

  it('builds the API address and knows when a filter is on', () => {
    expect(buildContactsPath(DEFAULT_CONTACTS_VIEW)).toBe('/contacts?page=1&limit=25');
    expect(
      buildContactsPath({ ...DEFAULT_CONTACTS_VIEW, searchText: 'a b', lifecycleStage: 'not_a_fit', page: 2 }),
    ).toBe('/contacts?q=a+b&lifecycleStage=not_a_fit&page=2&limit=25');
    expect(isContactsViewFiltered(DEFAULT_CONTACTS_VIEW)).toBe(false);
    expect(countActiveContactFilters(DEFAULT_CONTACTS_VIEW)).toBe(0);
    expect(countActiveContactFilters({ ...DEFAULT_CONTACTS_VIEW, searchText: 'a', lifecycleStage: 'lead' })).toBe(2);
    expect(isContactsViewFiltered({ ...DEFAULT_CONTACTS_VIEW, searchText: 'x' })).toBe(true);
  });
});

describe('the Add contact form', () => {
  it('needs a phone or an email', () => {
    expect(checkContactForm({ name: 'Priya', phone: '', email: '', language: '' }).contact).toBe(
      'contacts.form.needPhoneOrEmail',
    );
    expect(checkContactForm({ name: '', phone: '98470 12345', email: '', language: '' })).toEqual({});
  });

  it('refuses an email that does not look like one', () => {
    expect(checkContactForm({ name: '', phone: '', email: 'priya@', language: '' }).email).toBe(
      'contacts.form.emailInvalid',
    );
  });

  it('leaves out empty boxes and trims the rest', () => {
    expect(buildCreateContactRequest({ name: ' Priya ', phone: '', email: ' p@x.com ', language: '' })).toEqual({
      name: 'Priya',
      email: 'p@x.com',
    });
  });
});

describe('the Edit contact form', () => {
  const contact: Contact = {
    id: 'c1',
    name: 'Priya',
    phone: '+919847012345',
    email: null,
    language: 'en',
    lifecycleStage: 'new',
    companyId: null,
    custom: {},
    createdAt: '',
    updatedAt: '',
  };

  it('fills the boxes from the contact, with empty boxes for missing values', () => {
    expect(contactToFormFields(contact)).toEqual({ name: 'Priya', phone: '+919847012345', email: '', language: 'en' });
  });

  it('sends nothing when nothing changed', () => {
    expect(buildUpdateContactRequest(contactToFormFields(contact), contact, false)).toEqual({});
  });

  it('sends only what changed, null for an emptied box, and notAFit only when the tick moved', () => {
    const fields = { ...contactToFormFields(contact), name: ' Priya Nair ', language: '' };
    expect(buildUpdateContactRequest(fields, contact, true)).toEqual({
      name: 'Priya Nair',
      language: null,
      notAFit: true,
    });
    expect(buildUpdateContactRequest({ ...contactToFormFields(contact), email: 'p@x.com' }, contact, false)).toEqual({
      email: 'p@x.com',
    });
  });

  it('takes the not-a-fit mark off when it was on and is unticked', () => {
    expect(
      buildUpdateContactRequest(contactToFormFields(contact), { ...contact, lifecycleStage: 'not_a_fit' }, false),
    ).toEqual({ notAFit: false });
  });

  it('refuses a language that is not two letters', () => {
    expect(checkContactForm({ name: '', phone: '1', email: '', language: 'eng' }).language).toBe(
      'contacts.form.languageInvalid',
    );
  });

  it('keeps the extra conditions in the address and the API address, and counts them as filters', () => {
    const conditions = [{ field: 'custom.car', operator: 'is' as const, value: 'Swift' }];
    const view = { ...DEFAULT_CONTACTS_VIEW, conditions };
    expect(readContactsView(writeContactsView(view)).conditions).toEqual(conditions);
    expect(buildContactsPath(view)).toContain('filters=');
    expect(countActiveContactFilters(view)).toBe(1);
    expect(isContactsViewFiltered(view)).toBe(true);
    expect(readContactsView(new URLSearchParams({ filters: 'oops' })).conditions).toEqual([]);
  });
});
