import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import type { TicketDetail } from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LoadingState, TextAreaField, Tag, TicketsIcon } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { findLeadDisplayName, findOwnerLabel, formatMoment } from '../leads/lead-display';
import { EditTicketPanel } from './EditTicketPanel';
import { checkNote, MAX_DETAILS_LENGTH } from './ticket-form';
import { describeTicketChangeProblem } from './ticket-problem';
import { findPriorityLabelKey, findPriorityTagTone, findTypeLabelKey } from './tickets-view';

/** One small label and value in the details card. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-body-sm min-w-0 text-right break-words text-text-primary">{children}</dd>
    </div>
  );
}

/**
 * A ticket's own page (`/tickets/<id>`): the title with its priority, type and status, who it is about (a link to the contact),
 * who looks after it, the actions (take it, free it, edit, close or reopen), the details, and the notes with a box to add one.
 * "Back to tickets" returns to the view of the list the person came from. A closed ticket takes notes and a reopen, but no other
 * change. It has loading, "not found" and error states.
 */
export function TicketPage() {
  const { ticketId = '' } = useParams();
  const location = useLocation();
  const { sessionState } = useSession();
  const ticketResource = useApiResource<TicketDetail>(`/tickets/${ticketId}`);
  const [isEditOpen, setIsEditOpen] = useState(false);
  // A counter so each opening of the panel starts from what the ticket has now
  const [editOpenCount, setEditOpenCount] = useState(0);
  const [noteText, setNoteText] = useState('');
  const [noteProblem, setNoteProblem] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isActing, setIsActing] = useState(false);
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? '';

  const backLink = (
    <Link to={{ pathname: '/tickets', search: listSearch }} className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover">
      <ArrowLeft aria-hidden className="size-4" />
      {t('ticketPage.back')}
    </Link>
  );

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { timeZone } = sessionState.profile.business;
  const signedInUserId = sessionState.profile.user.id;

  if (ticketResource.state.status === 'loading') {
    return (
      <>
        {backLink}
        <Card>
          <LoadingState label={t('ticketPage.loading')} rows={4} />
        </Card>
      </>
    );
  }
  if (ticketResource.state.status === 'error') {
    const isMissing = ticketResource.state.httpStatus === 404;
    return (
      <>
        {backLink}
        <Card>
          {isMissing ? (
            <EmptyState icon={<TicketsIcon size={24} />} title={t('ticketPage.notFound.title')} description={t('ticketPage.notFound.description')} />
          ) : (
            <ErrorState title={t('ticketPage.loadError.title')} description={t('ticketPage.loadError.description')} action={<Button onClick={ticketResource.reload}>{t('session.retry')}</Button>} />
          )}
        </Card>
      </>
    );
  }

  const ticket = ticketResource.state.data;
  const isClosed = ticket.status === 'done';
  const writerLabel = (writtenByUserId: string | null) =>
    writtenByUserId === null ? t('ticketPage.notes.system') : writtenByUserId === signedInUserId ? t('leads.owner.you') : t('leads.owner.teamMember');

  // Sends one change (take it, free it, close, reopen, a note) and shows the result in words; the page loads again after it worked.
  const sendChange = async (request: Record<string, unknown>, successText: string): Promise<boolean> => {
    setIsActing(true);
    setActionNotice(null);
    try {
      await apiRequest('PATCH', `/tickets/${ticket.id}`, request);
      setActionNotice({ tone: 'success', text: successText });
      ticketResource.reload();
      return true;
    } catch (error) {
      setActionNotice({ tone: 'error', text: describeTicketChangeProblem(error) });
      return false;
    } finally {
      setIsActing(false);
    }
  };
  const addNote = async () => {
    const problemKey = checkNote(noteText);
    setNoteProblem(problemKey ? t(problemKey) : null);
    if (problemKey) return;
    if (await sendChange({ note: noteText.trim() }, t('ticketPage.notes.added'))) setNoteText('');
  };
  const openEditPanel = () => {
    setActionNotice(null);
    setEditOpenCount((count) => count + 1);
    setIsEditOpen(true);
  };

  return (
    <>
      {backLink}
      {actionNotice !== null ? (
        <Alert tone={actionNotice.tone} className="mb-4" action={<Button variant="link" onClick={() => setActionNotice(null)}>{t('contacts.dismiss')}</Button>}>
          {actionNotice.text}
        </Alert>
      ) : null}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-heading-xl break-words text-text-primary">{ticket.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Tag tone={findPriorityTagTone(ticket.priority)}>{t(findPriorityLabelKey(ticket.priority))}</Tag>
              <Tag tone={isClosed ? 'won' : 'new'}>{isClosed ? t('tickets.status.done') : t('tickets.status.open')}</Tag>
              <span className="text-body-sm text-text-secondary">{t(findTypeLabelKey(ticket.type))}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isClosed ? (
              <Button size="compact" variant="primary" isLoading={isActing} onClick={() => void sendChange({ status: 'open' }, t('ticketPage.reopened'))}>
                {t('ticketPage.reopen')}
              </Button>
            ) : (
              <>
                {ticket.ownerUserId !== signedInUserId ? (
                  <Button size="compact" disabled={isActing} onClick={() => void sendChange({ ownerUserId: signedInUserId }, t('ticketPage.assigned'))}>
                    {t('ticketPage.assignToMe')}
                  </Button>
                ) : null}
                {ticket.ownerUserId !== null ? (
                  <Button size="compact" disabled={isActing} onClick={() => void sendChange({ ownerUserId: null }, t('ticketPage.unassigned'))}>
                    {t('ticketPage.removeOwner')}
                  </Button>
                ) : null}
                <Button size="compact" disabled={isActing} onClick={openEditPanel}>
                  {t('ticketPage.edit.button')}
                </Button>
                <Button size="compact" variant="primary" isLoading={isActing} onClick={() => void sendChange({ status: 'done' }, t('ticketPage.closed'))}>
                  {t('ticketPage.close')}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-heading-sm mb-3 text-text-primary">{t('ticketPage.details.title')}</h3>
          <dl className="flex flex-col gap-2">
            <Row label={t('tickets.column.person')}>
              {ticket.contact === null ? (
                t('leads.contactRemoved')
              ) : (
                <Link to={`/contacts/${ticket.contact.id}`} className="text-link hover:text-link-hover hover:underline">
                  {findLeadDisplayName(ticket.contact)}
                </Link>
              )}
            </Row>
            <Row label={t('tickets.column.owner')}>{findOwnerLabel(ticket.ownerUserId, signedInUserId)}</Row>
            <Row label={t('tickets.column.opened')}>{formatMoment(ticket.createdAt, timeZone)}</Row>
            {isClosed ? <Row label={t('ticketPage.details.closedAt')}>{formatMoment(ticket.closedAt, timeZone)}</Row> : null}
          </dl>
          <h4 className="text-label-md mt-4 mb-1 text-text-primary">{t('tickets.form.details')}</h4>
          <p className="text-body-md break-words whitespace-pre-wrap text-text-secondary">{ticket.details ?? t('ticketPage.details.none')}</p>
        </Card>
        <Card>
          <h3 className="text-heading-sm mb-3 text-text-primary">{t('ticketPage.notes.title')}</h3>
          {ticket.notes.length === 0 ? (
            <p className="text-body-md mb-3 text-text-secondary">{t('ticketPage.notes.none')}</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-3">
              {ticket.notes.map((note) => (
                <li key={note.id} className="rounded-md border border-border-default bg-surface-subtle p-3">
                  <p className="text-body-md break-words whitespace-pre-wrap text-text-primary">{note.body}</p>
                  <p className="text-body-xs mt-1 text-text-secondary">
                    {writerLabel(note.writtenByUserId)} · {formatMoment(note.createdAt, timeZone)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <TextAreaField
            label={t('ticketPage.notes.label')}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            maxLength={MAX_DETAILS_LENGTH}
            {...(noteProblem ? { errorMessage: noteProblem } : {})}
          />
          <div className="mt-2">
            <Button size="compact" variant="primary" isLoading={isActing} onClick={() => void addNote()}>
              {t('ticketPage.notes.add')}
            </Button>
          </div>
        </Card>
      </div>
      <EditTicketPanel key={editOpenCount} ticket={ticket} isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} onSaved={() => { setIsEditOpen(false); setActionNotice({ tone: 'success', text: t('ticketPage.saved') }); ticketResource.reload(); }} />
    </>
  );
}
