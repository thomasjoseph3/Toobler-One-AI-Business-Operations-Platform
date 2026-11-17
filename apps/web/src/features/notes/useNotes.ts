import { useState } from 'react';
import type { ActivitiesListResponse } from '@toobler-one/shared';
import { ApiRequestError, apiRequest } from '../../api/client';
import { useApiResource, type LoadState } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { buildNoteRequest, buildNotesPath, checkNote, type NotesTarget } from './notes-state';

/** One plain sentence for a failed note. Never a code or a status number. */
function describeNoteProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('notes.problem.network');
    if (error.status === 403) return t('notes.problem.forbidden');
    if (error.status === 404) return t('notes.problem.gone');
    if (error.code === 'VALIDATION_ERROR') return error.message;
  }
  return t('notes.problem.generic');
}

/**
 * The notes of a lead or of a person: loads them (`GET /activities?lead_id=` or `?contact_id=`), keeps what is on screen while they load
 * again, adds a note (`POST /notes`), changes one and deletes one. The note box is checked on the device first. A failed note keeps its
 * words so it can be sent again. `onChanged` is called after any note was added, changed or deleted, so a screen that shows a count can
 * ask again.
 */
export function useNotes(
  target: NotesTarget,
  onChanged?: () => void,
): {
  state: LoadState<ActivitiesListResponse>;
  data: ActivitiesListResponse | null;
  isFirstLoad: boolean;
  hasFailed: boolean;
  reload: () => void;
  noteText: string;
  setNoteText: (text: string) => void;
  noteProblem: string | null;
  isSaving: boolean;
  /** Sends the typed note. Returns true when it was saved. */
  saveNote: () => Promise<boolean>;
  /** Changes the words of one note (`PATCH /notes/{id}`). Returns the problem in words, or null when it worked. */
  editNote: (noteId: string, text: string) => Promise<string | null>;
  /** Deletes one note (`DELETE /notes/{id}`, managers). Returns the problem in words, or null when it worked. */
  deleteNote: (noteId: string) => Promise<string | null>;
} {
  const resource = useApiResource<ActivitiesListResponse>(buildNotesPath(target));
  const kept = useKeptData(resource.state);
  const [noteText, setNoteTextState] = useState('');
  const [noteProblem, setNoteProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const setNoteText = (text: string) => {
    setNoteTextState(text);
    setNoteProblem(null);
  };

  const saveNote = async (): Promise<boolean> => {
    const problemKey = checkNote(noteText);
    if (problemKey !== null) {
      setNoteProblem(t(problemKey));
      return false;
    }
    setIsSaving(true);
    try {
      await apiRequest('POST', '/notes', buildNoteRequest(target, noteText));
      setNoteTextState('');
      setNoteProblem(null);
      resource.reload();
      onChanged?.();
      return true;
    } catch (error) {
      setNoteProblem(describeNoteProblem(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Changes one note's words, checking them first; the notes load again after it worked
  const editNote = async (noteId: string, text: string): Promise<string | null> => {
    const problemKey = checkNote(text);
    if (problemKey !== null) return t(problemKey);
    try {
      await apiRequest('PATCH', `/notes/${noteId}`, { body: text.trim() });
      resource.reload();
      onChanged?.();
      return null;
    } catch (error) {
      return describeNoteProblem(error);
    }
  };

  // Deletes one note; the notes load again after it worked
  const deleteNote = async (noteId: string): Promise<string | null> => {
    try {
      await apiRequest('DELETE', `/notes/${noteId}`);
      resource.reload();
      onChanged?.();
      return null;
    } catch (error) {
      return describeNoteProblem(error);
    }
  };

  return {
    state: resource.state,
    data: kept.data,
    isFirstLoad: kept.isFirstLoad,
    hasFailed: kept.hasFailed,
    reload: resource.reload,
    noteText,
    setNoteText,
    noteProblem,
    isSaving,
    saveNote,
    editNote,
    deleteNote,
  };
}
