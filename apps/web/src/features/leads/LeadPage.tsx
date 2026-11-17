import { ArrowLeft, Mail } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { Lead, Pipeline } from '@toobler-one/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LeadsIcon,
  LoadingState,
  PhoneIcon,
  Tag,
  WhatsappIcon,
} from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import {
  findChannelLabel,
  findLeadDisplayName,
  findOwnerLabel,
  findStageTagTone,
  formatMoment,
  toWhatsappDigits,
} from './lead-display';
import { LeadNotesCard } from '../notes/LeadNotesCard';
import { LeadTasksCard } from '../tasks/LeadTasksCard';
import { LeadDetailsCard } from './LeadDetailsCard';
import { readNoticeFromState, useLeadActions } from './useLeadActions';

/** One small label and value in the "About this lead" and "Contact" cards. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-body-sm min-w-0 text-right break-words text-text-primary">{children}</dd>
    </div>
  );
}

/**
 * A lead's own page (`/leads/<id>`): who it is with Call, WhatsApp and Email, the stage and owner, the actions (move, assign,
 * delete), the lead's details with editing, the facts about the lead, and a place for the timeline that arrives with notes, calls
 * and tasks. "Back to leads" returns to the view of the list the person came from.
 */
export function LeadPage() {
  const { leadId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionState } = useSession();
  const leadResource = useApiResource<Lead>(`/leads/${leadId}`);
  const pipelineResource = useApiResource<Pipeline>('/pipeline');
  const stages = pipelineResource.state.status === 'ready' ? pipelineResource.state.data.stages : [];
  const signedInUser =
    sessionState.status === 'signedIn'
      ? { id: sessionState.profile.user.id, role: sessionState.profile.user.role }
      : { id: '', role: '' };
  // The list view to go back to: what the list put in the link (its filter, sort and page), else the plain list
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? '';
  const backToList = { pathname: '/leads', search: listSearch };
  const actions = useLeadActions({
    stages,
    signedInUser,
    onChanged: leadResource.reload,
    // After a delete the lead is gone: go back to the list and carry the confirmation there
    onDeleted: (confirmation) => navigate(backToList, { state: { notice: { tone: 'success', text: confirmation } } }),
    initialNotice: readNoticeFromState(location.state),
  });

  if (sessionState.status !== 'signedIn') return null;
  const { business } = sessionState.profile;

  const backLink = (
    <Link
      to={backToList}
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('leadPage.back')}
    </Link>
  );

  if (leadResource.state.status === 'loading' || pipelineResource.state.status === 'loading') {
    return (
      <>
        {backLink}
        <Card>
          <LoadingState label={t('leadPage.loading')} rows={5} />
        </Card>
      </>
    );
  }

  if (leadResource.state.status === 'error') {
    const isMissing = leadResource.state.httpStatus === 404;
    return (
      <>
        {backLink}
        <Card>
          {isMissing ? (
            <EmptyState
              icon={<LeadsIcon size={24} />}
              title={t('leadPage.notFound.title')}
              description={t('leadPage.notFound.description')}
              action={
                <Link
                  to={backToList}
                  className="text-body-md-semibold inline-flex h-10 items-center rounded-md bg-action px-4 text-action-text hover:bg-action-hover"
                >
                  {t('leadPage.back')}
                </Link>
              }
            />
          ) : (
            <ErrorState
              title={t('leadPage.loadError.title')}
              description={t('leadPage.loadError.description')}
              action={<Button onClick={leadResource.reload}>{t('session.retry')}</Button>}
            />
          )}
        </Card>
      </>
    );
  }

  if (pipelineResource.state.status === 'error') {
    return (
      <>
        {backLink}
        <Card>
          <ErrorState
            title={t('leadPage.loadError.title')}
            description={t('leadPage.loadError.description')}
            action={<Button onClick={pipelineResource.reload}>{t('session.retry')}</Button>}
          />
        </Card>
      </>
    );
  }

  const lead = leadResource.state.data;
  const displayName = findLeadDisplayName(lead.contact);
  const openStageIdsInOrder = pipelineResource.state.data.stages
    .filter((stage) => stage.kind === 'open')
    .map((stage) => stage.id);
  const phone = lead.contact?.phone ?? null;
  const email = lead.contact?.email ?? null;

  return (
    <>
      {backLink}
      {actions.notice !== null ? (
        <Alert
          tone={actions.notice.tone}
          className="mb-4"
          action={
            <Button variant="link" onClick={actions.dismissNotice}>
              {t('leadForm.dismiss')}
            </Button>
          }
        >
          {actions.notice.text}
        </Alert>
      ) : null}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-heading-xl break-words text-text-primary">{displayName}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Tag tone={findStageTagTone(lead.stage, openStageIdsInOrder)}>{lead.stage.name}</Tag>
              <span className="text-body-sm text-text-secondary">
                {t('leadPage.about.owner')}:{' '}
                <span className="text-body-sm-medium text-text-primary">
                  {findOwnerLabel(lead.ownerUserId, signedInUser.id)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {phone ? (
              <ButtonLink size="compact" href={`tel:${phone}`} leadingIcon={<PhoneIcon size={16} />}>
                {t('leadPage.call')}
              </ButtonLink>
            ) : null}
            {phone ? (
              <ButtonLink
                size="compact"
                href={`https://wa.me/${toWhatsappDigits(phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                leadingIcon={<WhatsappIcon size={16} />}
              >
                {t('leadPage.whatsapp')}
              </ButtonLink>
            ) : null}
            {email ? (
              <ButtonLink size="compact" href={`mailto:${email}`} leadingIcon={<Mail aria-hidden className="size-4" />}>
                {t('leadPage.emailPerson')}
              </ButtonLink>
            ) : null}
            {/* On a phone the designer's "Change status" button moves the lead (cards cannot be dragged there) */}
            <span className="md:hidden">{actions.renderChangeStatusMenu(lead, displayName)}</span>
            {actions.renderRowMenu(lead, displayName, t('leadPage.actions'))}
          </div>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <LeadDetailsCard
            key={lead.updatedAt}
            lead={lead}
            timeZone={business.timeZone}
            onSaved={() => {
              actions.showNotice({ tone: 'success', text: t('leadPage.details.saved') });
              leadResource.reload();
            }}
          />
          <LeadTasksCard leadId={lead.id} leadDisplayName={displayName} />
          <LeadNotesCard leadId={lead.id} />
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <h3 className="text-heading-md mb-3 text-text-primary">{t('leadPage.contact.heading')}</h3>
            {lead.contact === null ? (
              <p className="text-body-md text-text-secondary">{t('leadPage.person.none')}</p>
            ) : (
              <dl className="flex flex-col gap-2">
                <Row label={t('leadPage.contact.name')}>{lead.contact.name ?? t('leadPage.notSet')}</Row>
                <Row label={t('leadPage.contact.phone')}>
                  {phone ? (
                    <a className="text-link hover:text-link-hover hover:underline" href={`tel:${phone}`}>
                      {phone}
                    </a>
                  ) : (
                    t('leadPage.notSet')
                  )}
                </Row>
                <Row label={t('leadPage.contact.email')}>
                  {email ? (
                    <a className="text-link hover:text-link-hover hover:underline" href={`mailto:${email}`}>
                      {email}
                    </a>
                  ) : (
                    t('leadPage.notSet')
                  )}
                </Row>
              </dl>
            )}
          </Card>
          <Card>
            <h3 className="text-heading-md mb-3 text-text-primary">{t('leadPage.about.heading')}</h3>
            <dl className="flex flex-col gap-2">
              <Row label={t('leadPage.about.stage')}>{lead.stage.name}</Row>
              <Row label={t('leadPage.about.owner')}>{findOwnerLabel(lead.ownerUserId, signedInUser.id)}</Row>
              <Row label={t('leadPage.about.source')}>{findChannelLabel(lead.firstChannel)}</Row>
              <Row label={t('leadPage.about.added')}>{formatMoment(lead.createdAt, business.timeZone)}</Row>
              <Row label={t('leadPage.about.lastActivity')}>{formatMoment(lead.lastActivityAt, business.timeZone)}</Row>
              {lead.closedAt ? (
                <Row label={t('leadPage.about.closed')}>{formatMoment(lead.closedAt, business.timeZone)}</Row>
              ) : null}
              {lead.lostReason ? <Row label={t('leadPage.about.lostBecause')}>{lead.lostReason}</Row> : null}
            </dl>
          </Card>
        </div>
      </div>
      {actions.dialogs}
    </>
  );
}
