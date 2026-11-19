import type { InboxItem, ListInboxQuery } from '@toobler-one/shared';
import { ApiRequestError } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';

// The thinking behind the Inbox screens, kept apart from the screens so it can be tested without drawing anything.

/** The words for each channel. */
export const CHANNEL_MESSAGE_KEYS: Record<InboxItem['channel'], MessageKey> = {
  webchat: 'filtered.channel.webchat',
  whatsapp: 'filtered.channel.whatsapp',
  email: 'filtered.channel.email',
  phone: 'filtered.channel.phone',
};

/** The channels in the order the filter shows them. */
export const CHANNEL_CHOICES: ReadonlyArray<InboxItem['channel']> = ['webchat', 'whatsapp', 'email', 'phone'];

/** What the inbox is showing: which filters are on, and the page. `status` is open unless the person asks for done. */
export interface InboxView {
  channel: InboxItem['channel'] | null;
  status: 'open' | 'done';
  heldByMe: boolean;
  needsPerson: boolean;
  page: number;
}

/** Reads the filters from the address (`?channel=whatsapp&status=done`); anything not understood is ignored. */
export function readInboxView(search: URLSearchParams): InboxView {
  const channel = CHANNEL_CHOICES.find((candidate) => candidate === search.get('channel')) ?? null;
  const page = Number.parseInt(search.get('page') ?? '1', 10);
  return {
    channel,
    status: search.get('status') === 'done' ? 'done' : 'open',
    heldByMe: search.get('held') === 'me',
    needsPerson: search.get('needs_person') === 'true',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** The address query for a view: only what differs from the plain "open conversations" is written, so the address stays short. */
export function writeInboxView(view: InboxView): URLSearchParams {
  const search = new URLSearchParams();
  if (view.channel) search.set('channel', view.channel);
  if (view.status === 'done') search.set('status', 'done');
  if (view.heldByMe) search.set('held', 'me');
  if (view.needsPerson) search.set('needs_person', 'true');
  if (view.page > 1) search.set('page', String(view.page));
  return search;
}

/** The API address that loads a view of the inbox. */
export function buildInboxApiPath(view: InboxView, pageSize: number): string {
  const query: Partial<Record<keyof ListInboxQuery, string>> = {
    status: view.status,
    page: String(view.page),
    limit: String(pageSize),
  };
  if (view.channel) query.channel = view.channel;
  if (view.heldByMe) query.held = 'me';
  if (view.needsPerson) query.needs_person = 'true';
  return `/conversations?${new URLSearchParams(query as Record<string, string>).toString()}`;
}

/** Who the conversation is with: the contact's name, else their phone or email, else "Unknown visitor". */
export function describeSender(item: Pick<InboxItem, 'contact' | 'fromPhone' | 'fromEmail'>): string {
  return item.contact?.name ?? item.fromPhone ?? item.fromEmail ?? t('inbox.unknownVisitor');
}

/** One plain sentence for a refused or failed step. The API's own words are used for a refusal that explains itself (someone else holds it). */
export function describeInboxProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('leads.error.network');
    if (error.status === 403) return t('leads.error.forbidden');
    if (error.status === 404) return t('inbox.error.gone');
    if (error.status === 400 || error.status === 409) return error.message;
  }
  return t('inbox.error.unknown');
}
