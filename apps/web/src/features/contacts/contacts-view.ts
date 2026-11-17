// What the Contacts list shows (search text, one lifecycle filter, the page) and how that is kept in the web address.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { LifecycleStage } from '@toobler-one/shared';
import type { TagTone } from '@toobler-one/ui';
import type { MessageKey } from '../../app/i18n';

/** How many contacts the list shows on a page (the API's default). */
export const CONTACTS_PAGE_SIZE = 25;

/** The lifecycle stages in the order the filter lists them, with the words for each. */
export const LIFECYCLE_CHOICES: ReadonlyArray<{ stage: LifecycleStage; labelKey: MessageKey }> = [
  { stage: 'new', labelKey: 'contacts.stage.new' },
  { stage: 'lead', labelKey: 'contacts.stage.lead' },
  { stage: 'customer', labelKey: 'contacts.stage.customer' },
  { stage: 'repeat_customer', labelKey: 'contacts.stage.repeat_customer' },
  { stage: 'not_a_fit', labelKey: 'contacts.stage.not_a_fit' },
];

/** What the list is showing: the typed search, one lifecycle stage (or `all`) and the page. */
export interface ContactsView {
  searchText: string;
  lifecycleStage: LifecycleStage | 'all';
  page: number;
}

export const DEFAULT_CONTACTS_VIEW: ContactsView = { searchText: '', lifecycleStage: 'all', page: 1 };

/** The words for a lifecycle stage, or the stage itself if it is one this screen does not know. */
export function findLifecycleLabelKey(stage: LifecycleStage): MessageKey {
  return LIFECYCLE_CHOICES.find((choice) => choice.stage === stage)?.labelKey ?? 'contacts.stage.new';
}

/** The tag colour for a stage. Only a hint: the stage's word always shows beside it. */
export function findLifecycleTagTone(stage: LifecycleStage): TagTone {
  if (stage === 'new') return 'new';
  if (stage === 'lead') return 'qualified';
  if (stage === 'customer' || stage === 'repeat_customer') return 'won';
  return 'lost';
}

/** Reads the list's view from the web address. Anything missing or not understood falls back to the default. */
export function readContactsView(searchParams: URLSearchParams): ContactsView {
  const stageText = searchParams.get('stage') ?? '';
  const matchingChoice = LIFECYCLE_CHOICES.find((choice) => choice.stage === stageText);
  const pageNumber = Number(searchParams.get('page'));
  return {
    searchText: (searchParams.get('q') ?? '').slice(0, 100),
    lifecycleStage: matchingChoice ? matchingChoice.stage : 'all',
    page: Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1,
  };
}

/** Writes the view into web address parameters, leaving out everything that is the default. */
export function writeContactsView(view: ContactsView): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (view.searchText.trim() !== '') searchParams.set('q', view.searchText.trim());
  if (view.lifecycleStage !== 'all') searchParams.set('stage', view.lifecycleStage);
  if (view.page > 1) searchParams.set('page', String(view.page));
  return searchParams;
}

/** The API address for a view: `/contacts?q=…&lifecycleStage=…&page=…&limit=25`. */
export function buildContactsPath(view: ContactsView): string {
  const query = new URLSearchParams();
  if (view.searchText.trim() !== '') query.set('q', view.searchText.trim());
  if (view.lifecycleStage !== 'all') query.set('lifecycleStage', view.lifecycleStage);
  query.set('page', String(view.page));
  query.set('limit', String(CONTACTS_PAGE_SIZE));
  return `/contacts?${query.toString()}`;
}

/** Whether any search or filter is on (so an empty list means "nothing matches", not "no contacts yet"). */
export function isContactsViewFiltered(view: ContactsView): boolean {
  return view.searchText.trim() !== '' || view.lifecycleStage !== 'all';
}

/** How many filters are on (the number on the Filter button): the stage filter, and the search text if there is one. */
export function countActiveContactFilters(view: ContactsView): number {
  return (view.lifecycleStage !== 'all' ? 1 : 0) + (view.searchText.trim() !== '' ? 1 : 0);
}
