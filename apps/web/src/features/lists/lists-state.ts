// Contact lists on the screen (F11): what a "Save as list" sends, and the sentence that says what was made. Pure functions (no screen, no network).
import type { CreateListRequest } from '@toobler-one/shared';
import { formatMessage } from '../../app/i18n';
import { MAX_CONTACT_LIST_NAME_LENGTH } from './list-name';
import type { ContactsView } from '../contacts/contacts-view';

/** What to send to make a list from the contacts list as it is on screen: the same search, stage and conditions, left out when they are not on. */
export function contactsViewToListRequest(view: ContactsView, name: string): CreateListRequest {
  const fromView: NonNullable<CreateListRequest['fromView']> = {};
  if (view.searchText.trim() !== '') fromView.q = view.searchText.trim();
  if (view.lifecycleStage !== 'all') fromView.lifecycleStage = view.lifecycleStage;
  if (view.conditions.length > 0) fromView.filters = JSON.stringify(view.conditions);
  return { name: name.trim().slice(0, MAX_CONTACT_LIST_NAME_LENGTH), fromView };
}

/** "Diwali offer 2026 was made with 12 contacts." (one contact, none: said in words that fit) */
export function describeListMade(name: string, memberCount: number): string {
  if (memberCount === 0) return formatMessage('lists.made.none', { name });
  if (memberCount === 1) return formatMessage('lists.made.one', { name });
  return formatMessage('lists.made.many', { name, count: memberCount });
}
