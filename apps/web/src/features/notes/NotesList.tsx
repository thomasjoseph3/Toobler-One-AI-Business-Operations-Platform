import { useState } from 'react';
import type { Activity } from '@toobler-one/shared';
import { Alert, Button, ConfirmDialog, TextAreaField } from '@toobler-one/ui';
import { formatMessage, t, type MessageKey } from '../../app/i18n';
import {
  canDeleteNote,
  canEditNote,
  describeWriterName,
  describeWriterRole,
  formatTimeAgo,
  describeSystemLine,
  initialsOf,
  isSystemLine,
} from './notes-state';

/** The writer's name: their own, or the words for an agent or a person who has left. */
function writerNameOf(note: Activity): string {
  const name = describeWriterName(note.writtenBy);
  return note.writtenBy.name !== null ? name : t(name as MessageKey);
}

export interface NotesListProps {
  /** The notes, already in the order to show them. */
  notes: readonly Activity[];
  /** The moment "how long ago" is counted from. */
  now: Date;
  signedInUserId: string;
  /** The signed-in person's role: only a manager may delete a note. */
  signedInRole: string;
  /** Changes the words of a note; gives back the problem in words, or null when it worked. */
  onEditNote: (noteId: string, text: string) => Promise<string | null>;
  /** Deletes a note; gives back the problem in words, or null when it worked. */
  onDeleteNote: (noteId: string) => Promise<string | null>;
}

/** One note's bubble, or its edit box while the writer changes it. */
function NoteBody({
  note,
  isEditing,
  onSave,
  onCancel,
}: {
  note: Activity;
  isEditing: boolean;
  onSave: (text: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(note.body ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isEditing) {
    return (
      <p className="text-body-md mt-1 rounded-lg bg-surface-subtle px-3 py-2 break-words whitespace-pre-wrap text-text-primary">
        {note.body}
      </p>
    );
  }
  // Checks the words, sends them, and keeps the box open with the reason when it did not work
  const save = async () => {
    setIsSaving(true);
    const result = await onSave(text);
    setIsSaving(false);
    setProblem(result);
  };
  return (
    <div className="mt-1 flex flex-col gap-2">
      <TextAreaField
        label={t('notes.editLabel')}
        isLabelHidden
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(null);
        }}
        {...(problem ? { errorMessage: problem } : {})}
      />
      <div className="flex justify-end gap-2">
        <Button size="compact" onClick={onCancel}>
          {t('notes.cancel')}
        </Button>
        <Button
          size="compact"
          variant="primary"
          isLoading={isSaving}
          disabled={text.trim() === ''}
          onClick={() => void save()}
        >
          {t('notes.saveChanges')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The notes of a lead, as in the design: a round avatar with the writer's initials, then their name, their role and how long ago, and
 * the note in a bubble. The writer sees Edit under their own notes (the words change in place); a manager sees Delete under every
 * note, which asks "Are you sure?" naming the writer first. A refusal is shown in words above the list.
 */
export function NotesList({ notes, now, signedInUserId, signedInRole, onEditNote, onDeleteNote }: NotesListProps) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Activity | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Saves the edited words; closes the edit box when it worked
  const saveEdit = async (noteId: string, text: string): Promise<string | null> => {
    const result = await onEditNote(noteId, text);
    if (result === null) setEditingNoteId(null);
    return result;
  };
  // Deletes the note the manager said yes to
  const confirmDelete = async () => {
    if (noteToDelete === null) return;
    setIsDeleting(true);
    setProblem(await onDeleteNote(noteToDelete.id));
    setIsDeleting(false);
    setNoteToDelete(null);
  };

  return (
    <>
      {problem ? (
        <Alert tone="error" className="mb-3">
          {problem}
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-4">
        {notes.map((note) => {
          // A line the system wrote (a lead was added, a lead moved): one quiet sentence and when, no avatar or bubble
          if (isSystemLine(note)) {
            const line = describeSystemLine(note);
            return (
              <li
                key={note.id}
                className="text-body-xs flex flex-wrap items-baseline justify-between gap-x-2 text-text-secondary"
              >
                <span className="min-w-0">{formatMessage(line.messageKey, line.values)}</span>
                <span className="shrink-0">{formatTimeAgo(note.createdAt, now)}</span>
              </li>
            );
          }
          const roleKey = describeWriterRole(note.writtenBy);
          const canEdit = canEditNote(note, signedInUserId);
          const canDelete = canDeleteNote(signedInRole);
          const isEditing = editingNoteId === note.id;
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
                <NoteBody
                  key={isEditing ? 'editing' : 'reading'}
                  note={note}
                  isEditing={isEditing}
                  onSave={(text) => saveEdit(note.id, text)}
                  onCancel={() => setEditingNoteId(null)}
                />
                <div className="mt-1 flex items-center gap-3">
                  {note.editedAt ? <span className="text-body-xs text-text-tertiary">{t('notes.edited')}</span> : null}
                  {canEdit && !isEditing ? (
                    <Button variant="link" onClick={() => setEditingNoteId(note.id)}>
                      {t('notes.edit')}
                    </Button>
                  ) : null}
                  {canDelete && !isEditing ? (
                    <Button variant="link" onClick={() => setNoteToDelete(note)}>
                      {t('notes.delete')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        isOpen={noteToDelete !== null}
        tone="danger"
        title={formatMessage('notes.delete.title', { name: noteToDelete ? writerNameOf(noteToDelete) : '' })}
        description={t('notes.delete.description')}
        confirmLabel={t('notes.delete.confirm')}
        cancelLabel={t('notes.cancel')}
        closeLabel={t('notes.delete.close')}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setNoteToDelete(null)}
      />
    </>
  );
}
