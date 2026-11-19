import { useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { Contact } from '@toobler-one/shared';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  ContactsIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  PhoneIcon,
  Tag,
  WhatsappIcon,
} from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { findLeadDisplayName, toWhatsappDigits, formatMoment } from '../leads/lead-display';
import { findLifecycleLabelKey, findLifecycleTagTone } from './contacts-view';
import { describeContactSaveProblem } from './contact-problem';
import { ContactNotesCard } from '../notes/ContactNotesCard';
import { ContactCompanyCard } from '../companies/ContactCompanyCard';
import { describeAnswer } from '../fields/custom-answers';
import { useFieldDefinitions } from '../fields/use-field-definitions';
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
  const navigate = useNavigate();
  const { sessionState } = useSession();
  const contactResource = useApiResource<Contact>(`/contacts/${contactId}`);
  const fieldDefinitions = useFieldDefinitions('contact');
  const [isEditOpen, setIsEditOpen] = useState(false);
  // A counter so each opening of the panel starts from what the contact has now
  const [editOpenCount, setEditOpenCount] = useState(0);
  const [isSavedNoticeShown, setIsSavedNoticeShown] = useState(false);
  const [isDeleteAsked, setIsDeleteAsked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null);
  const listSearch = (location.state as { listSearch?: string } | null)?.listSearch ?? '';
  const backLink = (
    <Link
      to={{ pathname: '/contacts', search: listSearch }}
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
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
            <EmptyState
              icon={<ContactsIcon size={24} />}
              title={t('contactPage.notFound.title')}
              description={t('contactPage.notFound.description')}
            />
          ) : (
            <ErrorState
              title={t('contactPage.loadError.title')}
              description={t('contactPage.loadError.description')}
              action={<Button onClick={contactResource.reload}>{t('session.retry')}</Button>}
            />
          )}
        </Card>
      </>
    );
  }

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { timeZone } = sessionState.profile.business;
  // Only managers can delete (the API refuses staff), so only they are shown the button
  const isManager = sessionState.profile.user.role === 'manager';
  const contact = contactResource.state.data;
  const displayName = findLeadDisplayName(contact);
  const handleSaved = () => {
    setIsEditOpen(false);
    setIsSavedNoticeShown(true);
    contactResource.reload();
  };
  // Deletes the contact (after the person said yes), then goes back to the list with a confirmation.
  const confirmDelete = async () => {
    setIsDeleting(true);
    setDeleteProblem(null);
    try {
      await apiRequest('DELETE', `/contacts/${contact.id}`);
      navigate(
        { pathname: '/contacts', search: listSearch },
        {
          state: { notice: { tone: 'success', text: formatMessage('contactPage.delete.done', { name: displayName }) } },
        },
      );
    } catch (error) {
      setDeleteProblem(describeContactSaveProblem(error));
      setIsDeleteAsked(false);
      setIsDeleting(false);
    }
  };
  const openEditPanel = () => {
    setIsSavedNoticeShown(false);
    setEditOpenCount((count) => count + 1);
    setIsEditOpen(true);
  };

  return (
    <>
      {backLink}
      {deleteProblem !== null ? (
        <Alert tone="error" className="mb-4">
          {deleteProblem}
        </Alert>
      ) : null}
      {isSavedNoticeShown ? (
        <Alert
          tone="success"
          className="mb-4"
          action={
            <Button variant="link" onClick={() => setIsSavedNoticeShown(false)}>
              {t('contacts.dismiss')}
            </Button>
          }
        >
          {t('contactPage.saved')}
        </Alert>
      ) : null}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-heading-xl break-words text-text-primary">{displayName}</h2>
            <div className="mt-2">
              <Tag tone={findLifecycleTagTone(contact.lifecycleStage)}>
                {t(findLifecycleLabelKey(contact.lifecycleStage))}
              </Tag>
              {contact.importedAt !== null ? <Tag tone="neutral">{t('contacts.imported')}</Tag> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {contact.phone ? (
              <ButtonLink size="compact" href={`tel:${contact.phone}`} leadingIcon={<PhoneIcon size={16} />}>
                {t('leadPage.call')}
              </ButtonLink>
            ) : null}
            {contact.phone ? (
              <ButtonLink
                size="compact"
                href={`https://wa.me/${toWhatsappDigits(contact.phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                leadingIcon={<WhatsappIcon size={16} />}
              >
                {t('leadPage.whatsapp')}
              </ButtonLink>
            ) : null}
            {contact.email ? (
              <ButtonLink
                size="compact"
                href={`mailto:${contact.email}`}
                leadingIcon={<Mail aria-hidden className="size-4" />}
              >
                {t('leadPage.emailPerson')}
              </ButtonLink>
            ) : null}
            <Button size="compact" onClick={openEditPanel}>
              {t('contactPage.edit.button')}
            </Button>
            {isManager ? (
              <Button size="compact" variant="destructive" onClick={() => setIsDeleteAsked(true)}>
                {t('contactPage.delete.button')}
              </Button>
            ) : null}
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
            {fieldDefinitions.map((definition) => (
              <Row key={definition.id} label={definition.label}>
                {describeAnswer(definition, contact.custom[definition.key])}
              </Row>
            ))}
            <Row label={t('contactPage.details.added')}>{formatMoment(contact.createdAt, timeZone)}</Row>
            <Row label={t('contactPage.details.updated')}>{formatMoment(contact.updatedAt, timeZone)}</Row>
          </dl>
        </Card>
        <div className="flex flex-col gap-6">
          <ContactCompanyCard contact={contact} onChanged={contactResource.reload} />
          <ContactNotesCard contactId={contact.id} />
        </div>
      </div>
      <ConfirmDialog
        isOpen={isDeleteAsked}
        tone="danger"
        title={formatMessage('contactPage.delete.title', { name: displayName })}
        description={t('contactPage.delete.description')}
        confirmLabel={t('contactPage.delete.confirm')}
        cancelLabel={t('contacts.form.cancel')}
        closeLabel={t('contactPage.delete.close')}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setIsDeleteAsked(false)}
      />
      <EditContactPanel
        key={editOpenCount}
        contact={contact}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}
