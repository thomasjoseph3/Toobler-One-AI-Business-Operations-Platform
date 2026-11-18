// The rules of the Notes panel: initials for the round avatar, "1 hr. ago", the sort order, the role words and checking a note before it
// is sent. Pure functions (no screen, no network), so each rule can be tested alone.
import type { Activity, ActivityKind, ActivityWriter } from '@toobler-one/shared';
import { MAX_NOTE_LENGTH } from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

/** The order the notes are shown in: oldest first (the newest nearest the box, like a chat) or newest first. */
export type NotesOrder = 'recentLast' | 'recentFirst';

/** The round avatar's letters: the first letter of the first two words of the name ("Maya Chen" is "MC"), or "?" when there is no name. */
export function initialsOf(name: string | null): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== '');
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * How long ago something happened, in the short words of the design ("just now", "5 min. ago", "1 hr. ago", "3 days ago"), then the
 * plain date for anything older than a month. `now` is passed in so the rule can be tested.
 */
export function formatTimeAgo(isoMoment: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(isoMoment).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min. ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr. ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(isoMoment),
  );
}

/** The notes in the chosen order, as a new list (the API sends newest first). */
export function sortNotes(notes: readonly Activity[], order: NotesOrder): Activity[] {
  const newestFirst = [...notes].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
  return order === 'recentFirst' ? newestFirst : newestFirst.reverse();
}

/** The words for a writer's role next to their name: "Manager", "Staff", "AI agent", or nothing for the system. */
export function describeWriterRole(writer: ActivityWriter): MessageKey | null {
  if (writer.kind === 'agent') return 'notes.role.agent';
  if (writer.kind === 'system') return null;
  if (writer.role === 'manager') return 'notes.role.manager';
  if (writer.role === 'staff' || writer.role === 'staff_own') return 'notes.role.staff';
  return null;
}

/** The name to show for a writer: their name, "AI agent" for an agent with no name, or "Someone who has left" when the person was removed. */
export function describeWriterName(writer: ActivityWriter): MessageKey | string {
  if (writer.name !== null) return writer.name;
  return writer.kind === 'user' ? 'notes.writer.removed' : 'notes.role.agent';
}

/** Checks a note before it is sent: the words it needs, or null when it is fine. */
export function checkNote(noteText: string): MessageKey | null {
  if (noteText.trim() === '') return 'notes.needText';
  if (noteText.trim().length > MAX_NOTE_LENGTH) return 'notes.tooLong';
  return null;
}

/** True when the signed-in person wrote this note, so they may change its words (only the writer may; a manager may delete, not change). */
export function canEditNote(note: Activity, signedInUserId: string): boolean {
  return note.writtenBy.kind === 'user' && note.writtenBy.userId === signedInUserId;
}

/** True when the person's role may delete a note: managers only (the API would refuse anyone else). */
export function canDeleteNote(role: string): boolean {
  return role === 'manager';
}

/** What a set of notes belongs to: one lead, or one person (whose notes include those on all their leads). A note can be written on these. */
export type NotesTarget = { kind: 'lead'; id: string } | { kind: 'contact'; id: string };

/** What a timeline can be read for: a note target, or one company (all its people's notes and news together, read only). */
export type TimelineTarget = NotesTarget | { kind: 'company'; id: string };

/** The API address that lists the timeline of a target, newest first (up to 100), narrowed to some kinds when `kinds` are given. */
export function buildNotesPath(target: TimelineTarget, kinds?: readonly ActivityKind[]): string {
  const filterName = target.kind === 'lead' ? 'lead_id' : target.kind === 'contact' ? 'contact_id' : 'company_id';
  const filter = `${filterName}=${target.id}`;
  return `/activities?${filter}${kinds && kinds.length > 0 ? `&kind=${kinds.join(',')}` : ''}&limit=100`;
}

/** What the filter chips above a timeline offer: everything, only notes, only stage changes, or only tasks. */
export type TimelineFilter = 'all' | 'note' | 'stage_changed' | 'task';

/** The kinds to ask the API for under a chip (nothing for "All"; the Tasks chip is a task being added and a task being completed). */
export function kindForTimelineFilter(filter: TimelineFilter): ActivityKind[] | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'task') return ['task_created', 'task_completed'];
  return [filter];
}

/** True for a line the system wrote by itself (a lead was added, a lead moved): it has no bubble, no Edit and no Delete. */
export function isSystemLine(activity: Activity): boolean {
  return activity.kind !== 'note';
}

/**
 * The plain sentence of a system line: which words to use and what to fill in. A person's or agent's name is used when the activity has
 * one, otherwise the sentence is said without a doer ("Lead added").
 */
export function describeSystemLine(activity: Activity): {
  messageKey: MessageKey;
  values: Record<string, string>;
} {
  const doerName = activity.writtenBy.name;
  const doer = doerName ?? '';
  if (activity.kind === 'lead_created') {
    return doerName === null
      ? { messageKey: 'timeline.leadAdded', values: {} }
      : { messageKey: 'timeline.leadAddedBy', values: { name: doer } };
  }
  if (activity.kind === 'task_created' || activity.kind === 'task_completed') {
    const title = activity.details?.taskTitle ?? '';
    const isCreated = activity.kind === 'task_created';
    if (doerName === null) {
      return { messageKey: isCreated ? 'timeline.taskAdded' : 'timeline.taskCompleted', values: { title } };
    }
    return {
      messageKey: isCreated ? 'timeline.taskAddedBy' : 'timeline.taskCompletedBy',
      values: { name: doer, title },
    };
  }
  const values = {
    name: doer,
    from: activity.details?.fromStageName ?? '',
    to: activity.details?.toStageName ?? '',
  };
  if (values.from === '') {
    return doerName === null
      ? { messageKey: 'timeline.movedTo', values }
      : { messageKey: 'timeline.movedToBy', values };
  }
  return doerName === null ? { messageKey: 'timeline.moved', values } : { messageKey: 'timeline.movedBy', values };
}

/** The request body that adds a note to a target: the words and exactly one of `leadId` or `contactId`. */
export function buildNoteRequest(
  target: NotesTarget,
  noteText: string,
): { leadId?: string; contactId?: string; body: string } {
  const body = noteText.trim();
  return target.kind === 'lead' ? { leadId: target.id, body } : { contactId: target.id, body };
}

/** The API address that counts the notes of some leads (for the orange notes icon), or null when there are no leads to ask about. */
export function buildNoteCountsPath(leadIds: readonly string[]): string | null {
  const ids = [...new Set(leadIds)].slice(0, 100);
  return ids.length === 0 ? null : `/activities/counts?lead_ids=${ids.join(',')}`;
}
