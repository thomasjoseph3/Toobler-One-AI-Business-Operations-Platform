// What the Leads list is showing: which leads (status, stage, owner), in what order, and which page. This is kept in the web
// address (/leads?status=closed&sort=createdAt), so a refresh or the Back button keeps the view and a link can be shared.
// Pure functions (no screen, no network), so each rule can be tested alone.
import type { PipelineStage } from '@toobler-one/shared';
import { t, type MessageKey } from '../../app/i18n';

/** `list` = the table; `pipeline` = the board with a column per stage. */
export type LeadsLayout = 'list' | 'pipeline';
export type LeadsStatus = 'open' | 'closed';
export type LeadsSort = 'lastActivity' | 'createdAt' | 'callbackAt' | 'stage';
export type LeadsOrder = 'asc' | 'desc';

/** The whole view of the leads page. */
export interface LeadsView {
  layout: LeadsLayout;
  /** `open` = still in progress; `closed` = won or lost. */
  status: LeadsStatus;
  /** One stage's id, or null for every stage. */
  stageId: string | null;
  /** `me` = only the leads the signed-in person owns. */
  owner: 'anyone' | 'me';
  sort: LeadsSort;
  order: LeadsOrder;
  page: number;
}

/** The view when the page is opened with nothing in the address: open leads, newest activity first, page 1. */
export const DEFAULT_LEADS_VIEW: LeadsView = {
  layout: 'list',
  status: 'open',
  stageId: null,
  owner: 'anyone',
  sort: 'lastActivity',
  order: 'desc',
  page: 1,
};

/** How many leads one page holds. */
export const LEADS_PAGE_SIZE = 25;

export const LEADS_SORTS: readonly LeadsSort[] = ['lastActivity', 'createdAt', 'callbackAt', 'stage'];

const STAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the view from the web address. Anything that is missing or not understood falls back to the default, so a bad link never breaks the page. */
export function readLeadsView(searchParams: URLSearchParams): LeadsView {
  const layout = searchParams.get('layout') === 'pipeline' ? 'pipeline' : DEFAULT_LEADS_VIEW.layout;
  const status = searchParams.get('status') === 'closed' ? 'closed' : DEFAULT_LEADS_VIEW.status;
  const stageIdText = searchParams.get('stage');
  const stageId = stageIdText !== null && STAGE_ID_PATTERN.test(stageIdText) ? stageIdText : null;
  const owner = searchParams.get('owner') === 'me' ? 'me' : DEFAULT_LEADS_VIEW.owner;
  const sortText = searchParams.get('sort');
  const sort = LEADS_SORTS.find((candidate) => candidate === sortText) ?? DEFAULT_LEADS_VIEW.sort;
  const order =
    searchParams.get('order') === 'asc'
      ? 'asc'
      : searchParams.get('order') === 'desc'
        ? 'desc'
        : DEFAULT_LEADS_VIEW.order;
  const pageNumber = Number(searchParams.get('page'));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : DEFAULT_LEADS_VIEW.page;
  return { layout, status, stageId, owner, sort, order, page };
}

/** Writes the view as a web address query. Only what differs from the default is written, so the plain page has a plain address. */
export function writeLeadsView(view: LeadsView): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (view.layout !== DEFAULT_LEADS_VIEW.layout) searchParams.set('layout', view.layout);
  if (view.status !== DEFAULT_LEADS_VIEW.status) searchParams.set('status', view.status);
  if (view.stageId !== null) searchParams.set('stage', view.stageId);
  if (view.owner !== DEFAULT_LEADS_VIEW.owner) searchParams.set('owner', view.owner);
  if (view.sort !== DEFAULT_LEADS_VIEW.sort) searchParams.set('sort', view.sort);
  if (view.order !== DEFAULT_LEADS_VIEW.order) searchParams.set('order', view.order);
  if (view.page !== DEFAULT_LEADS_VIEW.page) searchParams.set('page', String(view.page));
  return searchParams;
}

/** The API address for this view (`GET /leads?...`). "Only mine" becomes the signed-in person's id; the API checks it. */
export function buildLeadsPath(view: LeadsView, signedInUserId: string): string {
  // The board shows every stage (open, won and lost) with the newest leads of each, so only the owner narrows it
  if (view.layout === 'pipeline') {
    const boardQuery = new URLSearchParams({ view: 'board' });
    if (view.owner === 'me') boardQuery.set('ownerUserId', signedInUserId);
    return `/leads?${boardQuery.toString()}`;
  }
  const query = new URLSearchParams({
    status: view.status,
    sort: view.sort,
    order: view.order,
    page: String(view.page),
    limit: String(LEADS_PAGE_SIZE),
  });
  if (view.stageId !== null) query.set('stageId', view.stageId);
  if (view.owner === 'me') query.set('ownerUserId', signedInUserId);
  return `/leads?${query.toString()}`;
}

/** How many filters are switched on (shown as a number on the Filter button). Closed leads, one stage and "only mine" each count as one. */
export function countActiveFilters(view: LeadsView): number {
  // On the board only the owner filter applies, so the others do not count
  if (view.layout === 'pipeline') return view.owner !== 'anyone' ? 1 : 0;
  return [view.status !== 'open', view.stageId !== null, view.owner !== 'anyone'].filter(Boolean).length;
}

/** The stages a person can pick for this status: the open stages when looking at open leads, Won and Lost when looking at closed ones. */
export function findStageChoices(stages: readonly PipelineStage[], status: LeadsStatus): PipelineStage[] {
  return stages.filter((stage) => (status === 'open' ? stage.kind === 'open' : stage.kind !== 'open'));
}

/** The words for each sort. */
const SORT_LABEL_KEYS: Record<LeadsSort, MessageKey> = {
  lastActivity: 'leads.sort.lastActivity',
  createdAt: 'leads.sort.createdAt',
  callbackAt: 'leads.sort.callbackAt',
  stage: 'leads.sort.stage',
};

/** The words for one sort field ("Newest activity"). */
export function describeSort(sort: LeadsSort): string {
  return t(SORT_LABEL_KEYS[sort]);
}

/** The direction a sort starts in when it is picked: callbacks soonest first and the pipeline from its start, everything else newest first. */
export function findDefaultOrder(sort: LeadsSort): LeadsOrder {
  return sort === 'callbackAt' || sort === 'stage' ? 'asc' : 'desc';
}

/** The two directions for each sort, in words that fit it ("Newest first" for dates, "Soonest first" for callbacks). */
const ORDER_LABEL_KEYS: Record<LeadsSort, Record<LeadsOrder, MessageKey>> = {
  lastActivity: { desc: 'leads.order.lastActivity.desc', asc: 'leads.order.lastActivity.asc' },
  createdAt: { desc: 'leads.order.createdAt.desc', asc: 'leads.order.createdAt.asc' },
  callbackAt: { desc: 'leads.order.callbackAt.desc', asc: 'leads.order.callbackAt.asc' },
  stage: { desc: 'leads.order.stage.desc', asc: 'leads.order.stage.asc' },
};

/** The words for a direction of a sort ("Oldest first"). */
export function describeOrder(sort: LeadsSort, order: LeadsOrder): string {
  return t(ORDER_LABEL_KEYS[sort][order]);
}
