import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, ErrorState, LoadingState, SelectField, SidePanel, TextAreaField } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { NotesList } from './NotesList';
import { sortNotes, type NotesOrder } from './notes-state';
import { useLeadNotes } from './useLeadNotes';

export interface NotesPanelProps {
  leadId: string;
  /** The lead's name, shown under the title as "@Name". */
  leadName: string;
  onClose: () => void;
}

/**
 * The Notes panel of one lead (Figma "Leads - Note"): the title with how many notes there are, the lead's name, a sort ("Recent last" or
 * "Recent first"), the notes, and a box to write a new one with Cancel and Save at the bottom. It loads the notes when it opens, keeps them
 * on screen while it loads again, and shows the new note as soon as it is saved. Show it only while it is open.
 */
export function NotesPanel({ leadId, leadName, onClose }: NotesPanelProps) {
  const notes = useLeadNotes(leadId);
  const { sessionState } = useSession();
  const signedInUserId = sessionState.status === 'signedIn' ? sessionState.profile.user.id : '';
  const signedInRole = sessionState.status === 'signedIn' ? sessionState.profile.user.role : '';
  const [order, setOrder] = useState<NotesOrder>('recentLast');
  const listEndRef = useRef<HTMLDivElement>(null);
  const items = notes.data?.items ?? [];
  const sorted = sortNotes(items, order);

  // Keeps the newest note in view when the newest is last
  useEffect(() => {
    if (order === 'recentLast') listEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [items.length, order]);

  const save = async () => {
    await notes.saveNote();
  };

  return (
    <SidePanel
      isOpen
      onClose={onClose}
      title={t('notes.title')}
      titleExtra={<Badge tone="neutral">{notes.data?.total ?? 0}</Badge>}
      closeLabel={t('notes.close')}
      footer={
        <div className="flex w-full flex-col gap-3">
          <TextAreaField
            label={t('notes.boxLabel')}
            isLabelHidden
            placeholder={t('notes.placeholder')}
            value={notes.noteText}
            onChange={(event) => notes.setNoteText(event.target.value)}
            {...(notes.noteProblem ? { errorMessage: notes.noteProblem } : {})}
          />
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>{t('notes.cancel')}</Button>
            <Button
              variant="primary"
              isLoading={notes.isSaving}
              disabled={notes.noteText.trim() === ''}
              onClick={() => void save()}
            >
              {t('notes.save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <span className="text-label-md text-link">{formatMessage('notes.aboutLead', { name: leadName })}</span>
        <div className="w-40">
          <SelectField
            label={t('notes.sortLabel')}
            value={order}
            onChange={(event) => setOrder(event.target.value === 'recentFirst' ? 'recentFirst' : 'recentLast')}
            options={[
              { value: 'recentLast', label: t('notes.sort.recentLast') },
              { value: 'recentFirst', label: t('notes.sort.recentFirst') },
            ]}
          />
        </div>
      </div>
      {notes.isFirstLoad ? <LoadingState label={t('notes.loading')} rows={3} /> : null}
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
      {items.length > 0 ? (
        <NotesList
          notes={sorted}
          now={new Date()}
          signedInUserId={signedInUserId}
          signedInRole={signedInRole}
          onEditNote={notes.editNote}
          onDeleteNote={notes.deleteNote}
        />
      ) : null}
      <div ref={listEndRef} />
      {notes.noteProblem && items.length === 0 ? <Alert tone="error">{notes.noteProblem}</Alert> : null}
    </SidePanel>
  );
}
