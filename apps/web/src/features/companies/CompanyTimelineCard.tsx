import { useState } from 'react';
import { Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { NotesList } from '../notes/NotesList';
import { kindForTimelineFilter, sortNotes, type TimelineFilter } from '../notes/notes-state';
import { TimelineFilterChips } from '../notes/TimelineFilter';
import { useNotes } from '../notes/useNotes';

/**
 * The combined timeline on a company's page: the notes and news (stage changes, tasks) of all its people and all their leads, newest first,
 * with the same filter chips as a lead's own timeline. Read only: notes are written on a person or a lead. Not shown to the "own leads only"
 * role (the API refuses it: a company's whole timeline would show other people's leads).
 */
export function CompanyTimelineCard({ companyId }: { companyId: string }) {
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const timeline = useNotes({ kind: 'company', id: companyId }, undefined, kindForTimelineFilter(filter));
  const { sessionState } = useSession();
  const signedInUserId = sessionState.status === 'signedIn' ? sessionState.profile.user.id : '';
  const signedInRole = sessionState.status === 'signedIn' ? sessionState.profile.user.role : '';
  const items = timeline.data?.items ?? [];
  if (signedInRole === 'staff_own') return null;
  return (
    <Card aria-labelledby="company-timeline">
      <h3 id="company-timeline" className="text-heading-sm mb-3 text-text-primary">
        {t('companyPage.timeline.title')}
      </h3>
      <TimelineFilterChips value={filter} onChange={setFilter} />
      {timeline.isFirstLoad ? <LoadingState label={t('notes.loading')} rows={2} /> : null}
      {timeline.hasFailed ? (
        <ErrorState
          title={t('notes.loadError.title')}
          description={t('notes.loadError.description')}
          action={<Button onClick={timeline.reload}>{t('session.retry')}</Button>}
        />
      ) : null}
      {timeline.data !== null && items.length === 0 ? (
        <p className="text-body-md text-text-secondary">{t('companyPage.timeline.empty')}</p>
      ) : null}
      {items.length > 0 ? (
        <NotesList
          notes={sortNotes(items, 'recentFirst')}
          now={new Date()}
          signedInUserId={signedInUserId}
          signedInRole={signedInRole}
          onEditNote={timeline.editNote}
          onDeleteNote={timeline.deleteNote}
        />
      ) : null}
    </Card>
  );
}
