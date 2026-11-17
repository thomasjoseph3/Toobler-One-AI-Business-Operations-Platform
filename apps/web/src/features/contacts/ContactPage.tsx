import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import type { Contact } from '@toobler-one/shared';
import { Alert, Button, ButtonLink, Card, ContactsIcon, EmptyState, ErrorState, LoadingState, PhoneIcon, Tag, WhatsappIcon } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { findLeadDisplayName, toWhatsappDigits, formatMoment } from '../leads/lead-display';
import { findLifecycleLabelKey, findLifecycleTagTone } from './contacts-view';
import { EditContactPanel } from './EditContactPanel';

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
 * A contact's own page (`/contacts/<id>`): the name with Call, WhatsApp and Email, the stage, the details with an Edit button, and
 * a place for the timeline that arrives with notes, calls and tasks. "Back to contacts" returns to the view of the list the person
 * came from. It has loading, "not found" (another business's contact or a deleted one) and error states.
 */
export function ContactPage() {
  const { contactId = '' } = useParams();
  const location = useLocation();
  const { sessionState } = useSession();
  const contactResource = useApiResource<Contact>(`/contacts/${contactId}`);
  const [isEditOpen, setIsEditOpen] = useState(false);
  // A counter so each opening of the panel starts from what the contact has now
  const [editOpenCount, setEditOpenCount] = useState(0);
  const [isSavedNoticeShown, setIsSavedNoticeShown] = useState(false);
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? '';
  const backLink = (
    <Link to={{ pathname: '/contacts', search: listSearch }} className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover">
      <ArrowLeft aria-hidden className="size-4" />
      {t('contactPage.back')}
    </Link>
  );

  if (contactResource.state.status === 'loading') {
    return (
      <>
        {backLink}
        <Card>
          <LoadingState label={t('contactPage.loading')} rows={4} />
        </Card>
      </>
    );
  }
  if (contactResource.state.status === 'error') {
    const isMissing = contactResource.state.httpStatus === 404;
    return (
      <>
        {backLink}
        <Card>
          {isMissing ? (
            <EmptyState icon={<ContactsIcon size={24} />} title={t('contactPage.notFound.title')} description={t('contactPage.notFound.description')} />
          ) : (
            <ErrorState title={t('contactPage.loadError.title')} description={t('contactPage.loadError.description')} action={<Button onClick={contactResource.reload}>{t('session.retry')}</Button>} />
          )}
        </Card>
      </>
    );
  }

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { timeZone } = sessionState.profile.business;
  const contact = contactResource.state.data;
  const displayName = findLeadDisplayName(contact);
  const handleSaved = () => {
    setIsEditOpen(false);
    setIsSavedNoticeShown(true);
    contactResource.reload();
  };
  const openEditPanel = () => {
    setIsSavedNoticeShown(false);
    setEditOpenCount((count) => count + 1);
    setIsEditOpen(true);
  };

  return (
    <>
      {backLink}
      {isSavedNoticeShown ? (
        <Alert tone="success" className="mb-4" action={<Button variant="link" onClick={() => setIsSavedNoticeShown(false)}>{t('contacts.dismiss')}</Button>}>
          {t('contactPage.saved')}
        </Alert>
      ) : null}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-heading-xl break-words text-text-primary">{displayName}</h2>
            <div className="mt-2">
              <Tag tone={findLifecycleTagTone(contact.lifecycleStage)}>{t(findLifecycleLabelKey(contact.lifecycleStage))}</Tag>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contact.phone ? (
              <ButtonLink size="compact" href={`tel:${contact.phone}`} leadingIcon={<PhoneIcon size={16} />}>
                {t('leadPage.call')}
              </ButtonLink>
            ) : null}
            {contact.phone ? (
              <ButtonLink size="compact" href={`https://wa.me/${toWhatsappDigits(contact.phone)}`} target="_blank" rel="noopener noreferrer" leadingIcon={<WhatsappIcon size={16} />}>
                {t('leadPage.whatsapp')}
              </ButtonLink>
            ) : null}
            {contact.email ? (
              <ButtonLink size="compact" href={`mailto:${contact.email}`} leadingIcon={<Mail aria-hidden className="size-4" />}>
                {t('leadPage.emailPerson')}
              </ButtonLink>
            ) : null}
            <Button size="compact" onClick={openEditPanel}>
              {t('contactPage.edit.button')}
            </Button>
          </div>
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-heading-sm mb-3 text-text-primary">{t('contactPage.details.title')}</h3>
          <dl className="flex flex-col gap-2">
            <Row label={t('contacts.column.phone')}>{contact.phone ?? t('contacts.none')}</Row>
            <Row label={t('contacts.column.email')}>{contact.email ?? t('contacts.none')}</Row>
            <Row label={t('contacts.form.language')}>{contact.language ?? t('contacts.none')}</Row>
            <Row label={t('contactPage.details.added')}>{formatMoment(contact.createdAt, timeZone)}</Row>
            <Row label={t('contactPage.details.updated')}>{formatMoment(contact.updatedAt, timeZone)}</Row>
          </dl>
        </Card>
        <Card>
          <h3 className="text-heading-sm mb-2 text-text-primary">{t('contactPage.timeline.title')}</h3>
          <p className="text-body-md text-text-secondary">{t('contactPage.timeline.soon')}</p>
        </Card>
      </div>
      <EditContactPanel key={editOpenCount} contact={contact} isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} onSaved={handleSaved} />
    </>
  );
}
