// Saved views of the Leads list (F11): turning the list as it is on screen into a view to save, a saved view back into what the list shows, and
// finding which saved view the list is showing right now. Pure functions (no screen, no network), so each rule can be tested alone.
import type { CreateViewRequest, SavedView } from '@toobler-one/shared';
import { DEFAULT_LEADS_VIEW, type LeadsView } from './leads-view';

/** The longest name a view can have (the API refuses more). */
export const MAX_VIEW_NAME_LENGTH = 60;

/** What to send to save the list as it is: only the filters that differ from the plain list are written. */
export function leadsViewToRequest(view: LeadsView, name: string): CreateViewRequest {
  const filters: CreateViewRequest['filters'] = {};
  if (view.status !== DEFAULT_LEADS_VIEW.status) filters.status = view.status;
  if (view.stageId !== null) filters.stageId = view.stageId;
  if (view.owner !== DEFAULT_LEADS_VIEW.owner) filters.owner = 'me';
  return {
    object: 'lead',
    name: name.trim(),
    filters,
    sort: { field: view.sort, order: view.order },
    layout: view.layout,
  };
}

/** What the list shows for a saved view (page 1): whatever the view does not say is the plain list's own value. */
export function savedViewToLeadsView(saved: SavedView): LeadsView {
  return {
    layout: saved.layout,
    status: saved.filters.status ?? DEFAULT_LEADS_VIEW.status,
    stageId: saved.filters.stageId ?? DEFAULT_LEADS_VIEW.stageId,
    owner: saved.filters.owner === 'me' ? 'me' : DEFAULT_LEADS_VIEW.owner,
    sort: saved.sort?.field ?? DEFAULT_LEADS_VIEW.sort,
    order: saved.sort?.order ?? DEFAULT_LEADS_VIEW.order,
    page: 1,
  };
}

/** Leaves out what the list ignores in its layout (the board shows every stage and cannot sort), so two views that look the same count as the same. */
function normalise(view: LeadsView): LeadsView {
  if (view.layout === 'pipeline') return { ...DEFAULT_LEADS_VIEW, layout: 'pipeline', owner: view.owner };
  return { ...view, page: 1 };
}

/** True when two views show the same leads in the same way (the page does not matter). */
export function isSameLeadsView(first: LeadsView, second: LeadsView): boolean {
  const left = normalise(first);
  const right = normalise(second);
  return (
    left.layout === right.layout &&
    left.status === right.status &&
    left.stageId === right.stageId &&
    left.owner === right.owner &&
    left.sort === right.sort &&
    left.order === right.order
  );
}

/** The saved view the list is showing right now, or undefined (the plain list, or a list changed since it was opened). */
export function findActiveSavedView(savedViews: readonly SavedView[], current: LeadsView): SavedView | undefined {
  return savedViews.find((saved) => isSameLeadsView(savedViewToLeadsView(saved), current));
}

/** True when the list is the plain list nobody saved or changed. */
export function isPlainLeadsView(current: LeadsView): boolean {
  return isSameLeadsView(DEFAULT_LEADS_VIEW, current);
}
