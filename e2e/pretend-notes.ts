// The pretend notes for the browser tests. It answers the same calls as the real API (`GET /activities?lead_id=`, `POST /notes`), keeps
// what the page sent, and can be told to refuse the next note.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendNotes {
  /** The notes the pretend API has, newest first, as the real API sends them. */
  notes: Array<Record<string, unknown>>;
  /** What the page sent to add a note. */
  postedNotes: Array<{ leadId?: string; body?: string }>;
  /** When set, the next note is refused with this status and code. */
  refusal: { status: number; code: string; message: string } | null;
}

/** One existing note, written an hour ago by a colleague. */
export function startingNotes(): PretendNotes {
  return {
    notes: [
      {
        id: 'note-1',
        kind: 'note',
        contactId: 'contact-0',
        leadId: 'lead-0',
        body: 'Great insights on the project, looking forward to the next steps!',
        writtenBy: { kind: 'user', userId: 'user-colleague', name: 'Maya Chen', role: 'manager' },
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        editedAt: null,
      },
    ],
    postedNotes: [],
    refusal: null,
  };
}

/** Answers a notes call, or undefined when the call is not about notes. */
export function answerNotesCall(
  state: PretendNotes,
  call: { method: string; path: string; search: string; body: Record<string, unknown> | null; userName: string },
): PretendAnswer | undefined {
  if (call.path === '/activities' && call.method === 'GET') {
    const leadId = new URLSearchParams(call.search).get('lead_id');
    const items = state.notes.filter((note) => note['leadId'] === leadId);
    return { status: 200, body: { items, total: items.length, page: 1, limit: 100 } };
  }
  if (call.path === '/notes' && call.method === 'POST') {
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    const leadId = String(call.body?.['leadId']);
    const body = String(call.body?.['body']);
    state.postedNotes.push({ leadId, body });
    const note = {
      id: `note-${state.notes.length + 1}`,
      kind: 'note',
      contactId: 'contact-0',
      leadId,
      body,
      writtenBy: { kind: 'user', userId: 'user-me', name: call.userName, role: 'manager' },
      createdAt: new Date().toISOString(),
      editedAt: null,
    };
    state.notes = [note, ...state.notes];
    return { status: 201, body: note };
  }
  return undefined;
}
