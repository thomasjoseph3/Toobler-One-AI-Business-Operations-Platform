// Exporting a list from the screen (F12): which query to send so the file holds exactly what the list shows. Pure functions (no screen, no network).
import type { ExportObject } from '@toobler-one/shared';
import { buildCompaniesPath, type CompaniesView } from '../companies/companies-view';
import { buildContactsPath, type ContactsView } from '../contacts/contacts-view';
import { buildLeadsPath, type LeadsView } from '../leads/leads-view';

/** The list's own address query without the page and its size: those belong to the screen, an export holds every page. */
export function stripPaging(path: string): string {
  const query = new URLSearchParams(path.split('?')[1] ?? '');
  query.delete('page');
  query.delete('limit');
  query.delete('view');
  return query.toString();
}

/** What to send to export the contacts list as it is on screen. */
export function buildContactsExportRequest(view: ContactsView): { object: ExportObject; query: string } {
  return { object: 'contact', query: stripPaging(buildContactsPath(view)) };
}

/** What to send to export the companies list as it is on screen. */
export function buildCompaniesExportRequest(view: CompaniesView): { object: ExportObject; query: string } {
  return { object: 'company', query: stripPaging(buildCompaniesPath(view)) };
}

/** What to send to export the leads as the list shows them (even from the board: an export is always a list, with the board's owner and conditions). */
export function buildLeadsExportRequest(
  view: LeadsView,
  signedInUserId: string,
): { object: ExportObject; query: string } {
  return { object: 'lead', query: stripPaging(buildLeadsPath({ ...view, layout: 'list' }, signedInUserId)) };
}

/** How long to wait between asks while an export is being built, and the most asks (about two minutes) before the person is told to look again later. */
export const EXPORT_POLL_MILLISECONDS = 1500;
export const EXPORT_POLL_LIMIT = 80;
