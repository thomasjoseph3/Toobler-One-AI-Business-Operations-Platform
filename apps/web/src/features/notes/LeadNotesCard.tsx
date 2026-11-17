import { Button, Card, ErrorState, LoadingState, TextAreaField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { NotesList } from './NotesList';
import { sortNotes } from './notes-state';
import { useLeadNotes } from './useLeadNotes';

/**
 * The notes of a lead on its own page (the Timeline card): the notes, newest first, and a box to write a new one. The same notes and
 * the same checks as the Notes panel of the Leads list. It keeps the notes on screen while they load again.
 */
export function LeadNotesCard({ leadId }: { leadId: string }) {
  const notes = useLeadNotes(leadId);
  const items = notes.data?.items ?? [];
  return (
    <Card>
      <h3 className="text-heading-md mb-3 text-text-primary">{t('leadPage.timeline.heading')}</h3>
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
      {notes.isFirstLoad ? <LoadingState label={t('notes.loading')} rows={2} /> : null}
      {notes.hasFailed ? (
        <ErrorState
          title={t('notes.loadError.title')}
          description={t('notes.loadError.description')}
          action={<Button onClick={notes.reload}>{t('session.retry')}</Button>}
        />
      ) : null}
      {notes.data !== null && items.length === 0 ? (
        <p className="text-body-md text-text-secondary">{t('notes.empty')}</p>
      ) : null}
      {items.length > 0 ? <NotesList notes={sortNotes(items, 'recentFirst')} now={new Date()} /> : null}
    </Card>
  );
}
