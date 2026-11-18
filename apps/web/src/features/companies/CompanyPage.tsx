import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CompanyDetail, Contact } from '@toobler-one/shared';
import {
  Alert,
  Button,
  Card,
  CompaniesIcon,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Tag,
} from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { describeAnswer } from '../fields/custom-answers';
import { useFieldDefinitions } from '../fields/use-field-definitions';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { findLifecycleLabelKey, findLifecycleTagTone } from '../contacts/contacts-view';
import { formatBudget, findLeadDisplayName } from '../leads/lead-display';
import { ContactPicker } from '../tickets/ContactPicker';
import { CompanyFormPanel } from './CompanyFormPanel';
import { CompanyTimelineCard } from './CompanyTimelineCard';
import { describeCompanySaveProblem } from './company-problem';

/** One small label and value in the details card. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-body-sm min-w-0 text-right break-words text-text-primary">{children}</dd>
    </div>
  );
}

/** The tag colour for a lead's stage kind. Only a hint: the stage's own word always shows beside it. */
function stageTagTone(stageKind: 'open' | 'won' | 'lost') {
  if (stageKind === 'won') return 'won';
  if (stageKind === 'lost') return 'lost';
  return 'qualified';
}

/**
 * A company's own page (`/companies/<id>`): its details and numbers, its people (each linked to their page, with a way to take them out, and a
 * search to put another contact in) and their leads together. "Back to companies" returns to the list. It has loading, "not found" (another
 * business's company or a deleted one) and error states. The "own leads only" role sees only its own leads here, as everywhere.
 */
export function CompanyPage() {
  const { companyId = '' } = useParams();
  const { sessionState } = useSession();
  const navigate = useNavigate();
  const companyResource = useApiResource<CompanyDetail>(`/companies/${companyId}`);
  const fieldDefinitions = useFieldDefinitions('company');
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  // A counter so each opening of the form starts from what the company has now
  const [editOpenCount, setEditOpenCount] = useState(0);
  const [isDeleteAsked, setIsDeleteAsked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const backLink = (
    <Link
      to="/companies"
      className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {t('companyPage.back')}
    </Link>
  );

  if (companyResource.state.status === 'loading') {
    return (
      <>
        {backLink}
        <Card>
          <LoadingState label={t('companyPage.loading')} rows={4} />
        </Card>
      </>
    );
  }
  if (companyResource.state.status === 'error') {
    const isMissing = companyResource.state.httpStatus === 404;
    return (
      <>
        {backLink}
        <Card>
          {isMissing ? (
            <EmptyState
              icon={<CompaniesIcon size={24} />}
              title={t('companyPage.notFound.title')}
              description={t('companyPage.notFound.description')}
            />
          ) : (
            <ErrorState
              title={t('companyPage.loadError.title')}
              description={t('companyPage.loadError.description')}
              action={<Button onClick={companyResource.reload}>{t('session.retry')}</Button>}
            />
          )}
        </Card>
      </>
    );
  }

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const company = companyResource.state.data;
  // Only managers can delete (the API refuses staff), so only they are shown the button
  const isManager = sessionState.profile.user.role === 'manager';
  const nameOfContact = (contactId: string) => {
    const contact = company.contacts.find((candidate) => candidate.id === contactId);
    return contact ? findLeadDisplayName(contact) : t('leads.contactRemoved');
  };

  // Puts a contact in this company (or takes one out), then loads the company again
  const changePerson = async (contactId: string, companyIdToSet: string | null, doneText: string) => {
    setProblem(null);
    setNotice(null);
    try {
      await apiRequest<Contact>('PUT', `/contacts/${contactId}/company`, { companyId: companyIdToSet });
      setNotice(doneText);
      setIsAddingPerson(false);
    } catch (error) {
      setProblem(describeCompanySaveProblem(error));
    }
    companyResource.reload();
  };

  // Deletes the company (after the person said yes), then goes back to the list with a confirmation. Its people stay.
  const confirmDelete = async () => {
    setIsDeleting(true);
    setProblem(null);
    try {
      await apiRequest('DELETE', `/companies/${company.id}`);
      navigate('/companies', {
        state: { notice: { tone: 'success', text: formatMessage('companyPage.delete.done', { name: company.name }) } },
      });
    } catch (error) {
      setProblem(describeCompanySaveProblem(error));
      setIsDeleteAsked(false);
      setIsDeleting(false);
    }
  };

  return (
    <>
      {backLink}
      {problem ? (
        <Alert tone="error" className="mb-4">
          {problem}
        </Alert>
      ) : null}
      {notice ? (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      ) : null}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-heading-xl min-w-0 break-words text-text-primary">{company.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="compact"
              onClick={() => {
                setNotice(null);
                setEditOpenCount((count) => count + 1);
                setIsEditOpen(true);
              }}
            >
              {t('companyPage.edit.button')}
            </Button>
            {isManager ? (
              <Button size="compact" variant="destructive" onClick={() => setIsDeleteAsked(true)}>
                {t('companyPage.delete.button')}
              </Button>
            ) : null}
          </div>
        </div>
        <dl className="mt-4 grid gap-2 md:grid-cols-2 md:gap-x-8">
          <Row label={t('companyPage.domain')}>{company.domain ?? t('contacts.none')}</Row>
          <Row label={t('companyPage.phone')}>{company.phone ?? t('contacts.none')}</Row>
          <Row label={t('companyPage.city')}>{company.city ?? t('contacts.none')}</Row>
          <Row label={t('companies.column.owner')}>{company.owner?.name ?? t('companies.noOwner')}</Row>
          {fieldDefinitions.map((definition) => (
            <Row key={definition.id} label={definition.label}>
              {describeAnswer(definition, company.custom[definition.key])}
            </Row>
          ))}
          <Row label={t('companies.column.contacts')}>{company.contactCount}</Row>
          <Row label={t('companies.column.openLeads')}>{company.openLeads}</Row>
          <Row label={t('companies.column.wonValue')}>
            {company.wonValuePaise === 0 ? '–' : (formatBudget(company.wonValuePaise) ?? '–')}
          </Row>
        </dl>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card aria-labelledby="company-people">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id="company-people" className="text-heading-sm text-text-primary">
              {t('companyPage.people.title')}
            </h3>
            <Button size="compact" onClick={() => setIsAddingPerson((current) => !current)}>
              {t('companyPage.people.add')}
            </Button>
          </div>
          {isAddingPerson ? (
            <div className="mb-4">
              <ContactPicker
                chosenPerson={null}
                label={t('companyPage.people.pickerLabel')}
                hint={t('companyPage.people.pickerHint')}
                onChoose={(person) =>
                  person
                    ? void changePerson(
                        person.id,
                        company.id,
                        formatMessage('companyPage.people.added', { name: findLeadDisplayName(person) }),
                      )
                    : undefined
                }
              />
            </div>
          ) : null}
          {company.contacts.length === 0 ? (
            <p className="text-body-md text-text-secondary">{t('companyPage.people.empty')}</p>
          ) : null}
          <ul>
            {company.contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    to={`/contacts/${contact.id}`}
                    className="text-body-md-semibold text-text-primary hover:underline"
                  >
                    {findLeadDisplayName(contact)}
                  </Link>
                  <span className="text-body-sm text-text-secondary">
                    {[contact.phone, contact.email].filter((value) => value).join(' · ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag tone={findLifecycleTagTone(contact.lifecycleStage)}>
                    {t(findLifecycleLabelKey(contact.lifecycleStage))}
                  </Tag>
                  <Button
                    size="compact"
                    aria-label={formatMessage('companyPage.people.takeOutLabel', {
                      name: findLeadDisplayName(contact),
                    })}
                    onClick={() =>
                      void changePerson(
                        contact.id,
                        null,
                        formatMessage('companyPage.people.takenOut', { name: findLeadDisplayName(contact) }),
                      )
                    }
                  >
                    {t('companyPage.people.takeOut')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card aria-labelledby="company-leads">
          <h3 id="company-leads" className="text-heading-sm mb-3 text-text-primary">
            {t('companyPage.leads.title')}
          </h3>
          {company.leads.length === 0 ? (
            <p className="text-body-md text-text-secondary">{t('companyPage.leads.empty')}</p>
          ) : null}
          <ul>
            {company.leads.map((lead) => (
              <li key={lead.id} className="flex flex-col gap-1 border-b border-border-default py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/leads/${lead.id}`} className="text-body-md-semibold text-text-primary hover:underline">
                    {nameOfContact(lead.contactId)}
                  </Link>
                  <Tag tone={stageTagTone(lead.stageKind)}>{lead.stageName}</Tag>
                </div>
                <p className="text-body-sm text-text-secondary">
                  {[lead.interest, formatBudget(lead.budgetPaise)].filter((value) => value).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-6">
        <CompanyTimelineCard companyId={company.id} />
      </div>
      <ConfirmDialog
        isOpen={isDeleteAsked}
        tone="danger"
        title={formatMessage('companyPage.delete.title', { name: company.name })}
        description={t('companyPage.delete.description')}
        confirmLabel={t('companyPage.delete.confirm')}
        cancelLabel={t('companies.form.cancel')}
        closeLabel={t('companyPage.delete.close')}
        isConfirming={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setIsDeleteAsked(false)}
      />
      {isEditOpen ? (
        <CompanyFormPanel
          key={editOpenCount}
          isOpen
          editingCompany={company}
          onClose={() => setIsEditOpen(false)}
          onSaved={(companyName) => {
            setIsEditOpen(false);
            setNotice(formatMessage('companyPage.saved', { name: companyName }));
            companyResource.reload();
          }}
        />
      ) : null}
    </>
  );
}
