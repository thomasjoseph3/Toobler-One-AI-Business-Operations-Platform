// The pretend notes for the browser tests. It answers the same calls as the real API (`GET /activities?lead_id=`, `POST /notes`), keeps
// what the page sent, and can be told to refuse the next note.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendNotes {
  /** The notes the pretend API has, newest first, as the real API sends them. */
  notes: Array<Record<string, unknown>>;
  /** What the page sent to add a note. */
  postedNotes: Array<{ leadId?: string; body?: string }>;
  /** What the page sent to change a note's words, and which notes it deleted. */
  editedNotes: Array<{ noteId: string; body: string }>;
  deletedNoteIds: string[];
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
    editedNotes: [],
    deletedNoteIds: [],
    refusal: null,
  };
}

/** Answers a notes call, or undefined when the call is not about notes. */
export function answerNotesCall(
  state: PretendNotes,
  call: {
    method: string;
    path: string;
    search: string;
    body: Record<string, unknown> | null;
    userName: string;
    userId: string;
    role: string;
  },
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
      writtenBy: { kind: 'user', userId: call.userId, name: call.userName, role: 'manager' },
      createdAt: new Date().toISOString(),
      editedAt: null,
    };
    state.notes = [note, ...state.notes];
    return { status: 201, body: note };
  }
  const noteMatch = /^\/notes\/([^/]+)$/.exec(call.path);
  if (noteMatch && (call.method === 'PATCH' || call.method === 'DELETE')) {
    const noteId = noteMatch[1]!;
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    const note = state.notes.find((candidate) => candidate['id'] === noteId);
    if (!note) return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'That note was not found.' } } };
    if (call.method === 'DELETE') {
      if (call.role !== 'manager')
        return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
      state.deletedNoteIds.push(noteId);
      state.notes = state.notes.filter((candidate) => candidate['id'] !== noteId);
      return { status: 204 };
    }
    const writer = note['writtenBy'] as { userId: string };
    if (writer.userId !== call.userId) {
      return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'You can only change notes you wrote.' } } };
    }
    const body = String(call.body?.['body']);
    state.editedNotes.push({ noteId, body });
    const edited = { ...note, body, editedAt: new Date().toISOString() };
    state.notes = state.notes.map((candidate) => (candidate['id'] === noteId ? edited : candidate));
    return { status: 200, body: edited };
  }
  return undefined;
}
