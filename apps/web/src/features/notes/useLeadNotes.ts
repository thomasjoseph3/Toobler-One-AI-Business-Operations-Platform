import { useState } from 'react';
import type { ActivitiesListResponse } from '@toobler-one/shared';
import { ApiRequestError, apiRequest } from '../../api/client';
import { useApiResource, type LoadState } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useKeptData } from '../knowledge/use-kept-resource';
import { checkNote } from './notes-state';

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
 * One lead's notes: loads them (`GET /activities?lead_id=`), keeps what is on screen while they load again, and adds a note
 * (`POST /notes`). The note box is checked on the device first. A failed note keeps its words so it can be sent again.
 */
export function useLeadNotes(leadId: string): {
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
} {
  const resource = useApiResource<ActivitiesListResponse>(`/activities?lead_id=${leadId}&limit=100`);
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
      await apiRequest('POST', '/notes', { leadId, body: noteText.trim() });
      setNoteTextState('');
      setNoteProblem(null);
      resource.reload();
      return true;
    } catch (error) {
      setNoteProblem(describeNoteProblem(error));
      return false;
    } finally {
      setIsSaving(false);
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
  };
}
