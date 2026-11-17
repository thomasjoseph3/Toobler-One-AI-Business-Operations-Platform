// The rules of the Notes panel: initials for the round avatar, "1 hr. ago", the sort order, the role words and checking a note before it
// is sent. Pure functions (no screen, no network), so each rule can be tested alone.
import type { Activity, ActivityWriter } from '@toobler-one/shared';
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
