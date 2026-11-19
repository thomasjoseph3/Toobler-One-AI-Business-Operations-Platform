import { Button, Card, ErrorState, LoadingState, TextAreaField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useState } from 'react';
import { NotesList } from './NotesList';
import { kindForTimelineFilter, sortNotes, type TimelineFilter } from './notes-state';
import { TimelineFilterChips } from './TimelineFilter';
import { useNotes } from './useNotes';

/**
 * The notes on a contact's own page: every note written on the person or on any of their leads, newest first, and a box to write a new
 * note on the person. It is not shown to the "own leads only" role (a person's whole timeline would show other people's leads).
 */
export function ContactNotesCard({ contactId }: { contactId: string }) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const notes = useNotes({ kind: 'contact', id: contactId }, undefined, kindForTimelineFilter(filter));
  const { sessionState } = useSession();
  const signedInUserId = sessionState.status === 'signedIn' ? sessionState.profile.user.id : '';
  const signedInRole = sessionState.status === 'signedIn' ? sessionState.profile.user.role : '';
  const items = notes.data?.items ?? [];
  if (signedInRole === 'staff_own') return null;
  return (
    <Card>
      <h3 className="text-heading-sm mb-3 text-text-primary">{t('notes.title')}</h3>
      <TextAreaField
        label={t('notes.boxLabel')}
        isLabelHidden
        placeholder={t('notes.placeholder')}
        value={notes.noteText}
        onChange={(event) => notes.setNoteText(event.target.value)}
        {...(notes.noteProblem ? { errorMessage: notes.noteProblem } : {})}
      />
      <div className="mt-2 mb-4 flex justify-end">
        <Button
          variant="primary"
          isLoading={notes.isSaving}
          disabled={notes.noteText.trim() === ''}
          onClick={() => void notes.saveNote()}
        >
          {t('notes.save')}
        </Button>
      </div>
      <TimelineFilterChips value={filter} onChange={setFilter} />
      {notes.isFirstLoad ? <LoadingState label={t('notes.loading')} rows={2} /> : null}
      {notes.hasFailed ? (
        <ErrorState
          title={t('notes.loadError.title')}
          description={t('notes.loadError.description')}
          action={<Button onClick={notes.reload}>{t('session.retry')}</Button>}
        />
      ) : null}
      {notes.data !== null && items.length === 0 ? (
        <p className="text-body-md text-text-secondary">
          {filter === 'all' || filter === 'note' ? t('notes.empty') : t('timeline.empty')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <NotesList
          notes={sortNotes(items, 'recentFirst')}
          now={new Date()}
          signedInUserId={signedInUserId}
          signedInRole={signedInRole}
          onEditNote={notes.editNote}
          onDeleteNote={notes.deleteNote}
        />
      ) : null}
    </Card>
  );
}
