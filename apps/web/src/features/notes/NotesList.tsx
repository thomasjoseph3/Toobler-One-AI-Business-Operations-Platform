import type { Activity } from '@toobler-one/shared';
import { t, type MessageKey } from '../../app/i18n';
import { describeWriterName, describeWriterRole, formatTimeAgo, initialsOf } from './notes-state';

/** The writer's name: their own, or the words for an agent or a person who has left. */
function writerNameOf(note: Activity): string {
  const name = describeWriterName(note.writtenBy);
  return note.writtenBy.name !== null ? name : t(name as MessageKey);
}

/**
 * The notes of a lead, as in the design: a round avatar with the writer's initials, then their name, their role and how long ago, and
 * the note in a bubble. The notes arrive already in the order to show them. `now` is the moment "how long ago" is counted from.
 */
export function NotesList({ notes, now }: { notes: readonly Activity[]; now: Date }) {
  return (
    <ul className="flex flex-col gap-4">
      {notes.map((note) => {
        const roleKey = describeWriterRole(note.writtenBy);
        return (
          <li key={note.id} className="flex items-start gap-3">
            <span
              aria-hidden
              className="text-label-xs flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-text-secondary"
            >
              {initialsOf(note.writtenBy.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-xs flex flex-wrap items-baseline justify-between gap-x-2 text-text-secondary">
                <span className="min-w-0">
                  <span className="text-body-xs-medium text-text-primary">{writerNameOf(note)}</span>
                  {roleKey ? ` · ${t(roleKey)}` : ''}
                </span>
                <span className="shrink-0">{formatTimeAgo(note.createdAt, now)}</span>
              </p>
              <p className="text-body-md mt-1 rounded-lg bg-surface-subtle px-3 py-2 break-words whitespace-pre-wrap text-text-primary">
                {note.body}
              </p>
              {note.editedAt ? <p className="text-body-xs mt-1 text-text-tertiary">{t('notes.edited')}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
