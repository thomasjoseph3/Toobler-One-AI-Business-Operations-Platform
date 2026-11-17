// The pretend notes for the browser tests. It answers the same calls as the real API (`GET /activities?lead_id=`, `POST /notes`), keeps
// what the page sent, and can be told to refuse the next note.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendNotes {
  /** The notes the pretend API has, newest first, as the real API sends them. */
  notes: Array<Record<string, unknown>>;
  /** What the page sent to add a note. */
  postedNotes: Array<{ leadId?: string; contactId?: string; body?: string }>;
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
        details: null,
        writtenBy: { kind: 'user', userId: 'user-colleague', name: 'Maya Chen', role: 'manager' },
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
        editedAt: null,
      },
      // A line the system wrote when Maya added a task (F08)
      {
        id: 'line-2',
        kind: 'task_created',
        contactId: 'contact-0',
        leadId: 'lead-0',
        body: null,
        details: { taskTitle: 'Call Priya about the quote', taskKind: 'call' },
        writtenBy: { kind: 'user', userId: 'user-colleague', name: 'Maya Chen', role: 'manager' },
        createdAt: new Date(Date.now() - 10_800_000).toISOString(),
        editedAt: null,
      },
      // A line the system wrote when Maya moved the lead (F07 slice 4); the Notes panel asks for notes only and never shows it
      {
        id: 'line-1',
        kind: 'stage_changed',
        contactId: 'contact-0',
        leadId: 'lead-0',
        body: null,
        details: { fromStageName: 'New', toStageName: 'Contacted' },
        writtenBy: { kind: 'user', userId: 'user-colleague', name: 'Maya Chen', role: 'manager' },
        createdAt: new Date(Date.now() - 7_200_000).toISOString(),
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
  // How many notes each asked-about lead has (for the orange notes icon in the list)
  if (call.path === '/activities/counts' && call.method === 'GET') {
    const leadIds = (new URLSearchParams(call.search).get('lead_ids') ?? '').split(',').filter((id) => id !== '');
    const counts = Object.fromEntries(
      leadIds.map((leadId) => [
        leadId,
        state.notes.filter((note) => note['leadId'] === leadId && note['kind'] === 'note').length,
      ]),
    );
    return { status: 200, body: { counts } };
  }
  // A person's own page (the contact the notes belong to)
  const contactMatch = /^\/contacts\/(contact-\d+)$/.exec(call.path);
  if (contactMatch && call.method === 'GET') {
    const index = contactMatch[1]!.replace('contact-', '');
    return {
      status: 200,
      body: {
        id: contactMatch[1],
        name: `Priya Menon ${index}`,
        phone: '+919847010000',
        email: 'person0@example.com',
        language: null,
        lifecycleStage: 'lead',
        createdAt: '2026-11-10T08:00:00.000Z',
        updatedAt: '2026-11-16T09:30:00.000Z',
      },
    };
  }
  if (call.path === '/activities' && call.method === 'GET') {
    const params = new URLSearchParams(call.search);
    const leadId = params.get('lead_id');
    const contactId = params.get('contact_id');
    const kind = params.get('kind');
    const items = state.notes.filter(
      (note) =>
        (leadId !== null ? note['leadId'] === leadId : note['contactId'] === contactId) &&
        (kind === null || kind.split(',').includes(String(note['kind']))),
    );
    return { status: 200, body: { items, total: items.length, page: 1, limit: 100 } };
  }
  if (call.path === '/notes' && call.method === 'POST') {
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    const leadId = call.body?.['leadId'] === undefined ? null : String(call.body['leadId']);
    const contactId =
      call.body?.['contactId'] === undefined
        ? `contact-${(leadId ?? 'lead-0').replace('lead-', '')}`
        : String(call.body['contactId']);
    const body = String(call.body?.['body']);
    state.postedNotes.push({
      ...(leadId === null ? {} : { leadId }),
      ...(call.body?.['contactId'] === undefined ? {} : { contactId }),
      body,
    });
    const note = {
      id: `note-${state.notes.filter((existing) => existing['kind'] === 'note').length + 1}`,
      kind: 'note',
      contactId,
      leadId,
      body,
      details: null,
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
