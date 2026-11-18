// The pretend imports and exports for the browser tests. It answers the same calls as the real API (`/imports` and `/exports`), keeps what the page sent, shows
// progress over a few asks, and can be told to refuse a step.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendImports {
  /** The file names the page uploaded. */
  uploads: string[];
  /** The columns the page sent to check, and how many times it started a run. */
  mappings: Array<Array<string | null>>;
  runs: number;
  /** When set, the next upload is refused with this status, code and message. */
  uploadRefusal: { status: number; code: string; message: string } | null;
  /** How many asks the page makes while the run shows progress, before it is done. */
  progressAsks: number;
  /** The export requests the page sent, and how many times it asked for status. */
  exportRequests: Array<Record<string, unknown>>;
  exportAsks: number;
  /** Whether the next export fails to build. */
  exportFails: boolean;
  /** The times the page downloaded an export. */
  downloads: number;
  /** Whether the export from the email link has expired. */
  expired: boolean;
}

export function startingImports(): PretendImports {
  return {
    uploads: [],
    mappings: [],
    runs: 0,
    uploadRefusal: null,
    progressAsks: 2,
    exportRequests: [],
    exportAsks: 0,
    exportFails: false,
    downloads: 0,
    expired: false,
  };
}

const HEADERS = ['Full Name', 'Mobile', 'E-mail', 'Company', 'Favourite colour'];
const SAMPLE = [
  ['Priya Menon', '98470 12345', 'priya@menon.example', 'Infosys HR', 'Blue'],
  ['Rahul Nair', '94470 00111', '', 'Menon Weddings', 'Green'],
];
const GUESSED = ['name', 'phone', 'email', 'company', null];

/** The import as the API answers it. */
function importOf(state: PretendImports, status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'import-1',
    fileName: state.uploads.at(-1) ?? 'customers.csv',
    status,
    rowCount: 1300,
    headers: HEADERS,
    sample: status === 'uploaded' || status === 'ready' ? SAMPLE : [],
    targets: state.mappings.at(-1) ?? GUESSED,
    counts: null,
    processed: 0,
    report: [],
    error: null,
    createdAt: '2026-11-18T10:00:00.000Z',
    finishedAt: null,
    ...extra,
  };
}

/** Answers an imports or exports call, or undefined when the call is not about them. */
export function answerImportsCall(
  state: PretendImports,
  call: { method: string; path: string; body: Record<string, unknown> | null; fileName: string | null },
): (PretendAnswer & { text?: string; headers?: Record<string, string> }) | undefined {
  if (call.path === '/imports' && call.method === 'POST') {
    if (state.uploadRefusal) {
      const { status, code, message } = state.uploadRefusal;
      state.uploadRefusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.uploads.push(call.fileName ?? 'customers.csv');
    return { status: 201, body: importOf(state, 'uploaded') };
  }
  if (call.path === '/imports/import-1' && call.method === 'PATCH') {
    state.mappings.push((call.body?.['targets'] as Array<string | null>) ?? []);
    return {
      status: 200,
      body: importOf(state, 'ready', {
        counts: { newContacts: 1240, matchedContacts: 46, skipped: 14 },
        report: [
          { row: 5, reason: 'invalid_phone', message: 'The phone number is not a valid number.' },
          { row: 9, reason: 'no_contact_point', message: 'The row has no phone number and no email address.' },
        ],
      }),
    };
  }
  if (call.path === '/imports/import-1/run' && call.method === 'POST') {
    state.runs += 1;
    state.progressAsks = 2;
    return { status: 202, body: importOf(state, 'running') };
  }
  if (call.path === '/imports/import-1' && call.method === 'GET') {
    if (state.progressAsks > 0) {
      state.progressAsks -= 1;
      return { status: 200, body: importOf(state, 'running', { processed: 650 }) };
    }
    return {
      status: 200,
      body: importOf(state, 'done', {
        processed: 1300,
        counts: { newContacts: 1240, matchedContacts: 46, skipped: 14 },
        report: [{ row: 5, reason: 'invalid_phone', message: 'The phone number is not a valid number.' }],
        finishedAt: '2026-11-18T10:01:00.000Z',
      }),
    };
  }
  if (call.path === '/exports' && call.method === 'POST') {
    state.exportRequests.push(call.body ?? {});
    state.exportAsks = 0;
    return {
      status: 202,
      body: {
        id: 'export-1',
        object: call.body?.['object'],
        status: 'queued',
        fileName: null,
        rowCount: null,
        expiresAt: null,
        downloadPath: null,
        error: null,
        createdAt: '2026-11-18T10:00:00.000Z',
      },
    };
  }
  if (call.path === '/exports/export-1' && call.method === 'GET') {
    state.exportAsks += 1;
    const base = { id: 'export-1', object: 'contact', createdAt: '2026-11-18T10:00:00.000Z' };
    if (state.exportAsks === 1)
      return {
        status: 200,
        body: {
          ...base,
          status: 'running',
          fileName: null,
          rowCount: null,
          expiresAt: null,
          downloadPath: null,
          error: null,
        },
      };
    if (state.exportFails) {
      return {
        status: 200,
        body: {
          ...base,
          status: 'failed',
          fileName: null,
          rowCount: null,
          expiresAt: null,
          downloadPath: null,
          error: 'The export could not be built. Check the list and try again.',
        },
      };
    }
    return {
      status: 200,
      body: {
        ...base,
        status: 'done',
        fileName: 'contacts-2026-11-18.csv',
        rowCount: 2,
        expiresAt: '2026-11-19T10:00:00.000Z',
        downloadPath: state.expired ? null : '/api/v1/exports/export-1/download',
        error: null,
      },
    };
  }
  if (call.path === '/exports/export-1/download' && call.method === 'GET') {
    state.downloads += 1;
    return {
      status: 200,
      body: undefined,
      text: '﻿Name,Phone\r\nPriya Menon,+919847012345\r\n',
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="contacts-2026-11-18.csv"',
      },
    };
  }
  return undefined;
}
