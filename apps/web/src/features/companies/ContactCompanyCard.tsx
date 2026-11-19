import { useState } from 'react';
import type { CompaniesListResponse, Company, CompanyDetail, Contact } from '@toobler-one/shared';
import { Alert, Button, Card } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { CompanyNameLink } from './CompanyNameLink';
import { CompanyPicker } from './CompanyPicker';
import { findSuggestionDomain } from './company-suggestion';
import { describeCompanySaveProblem } from './company-problem';

/** "Infosys HR" with its website and city under it, for a company the contact is in. */
function CompanyLine({ companyId }: { companyId: string }) {
  const companyResource = useApiResource<CompanyDetail>(`/companies/${companyId}`);
  if (companyResource.state.status === 'loading') {
    return <p className="text-body-sm text-text-secondary">{t('companies.box.loading')}</p>;
  }
  if (companyResource.state.status === 'error') {
    return <p className="text-body-sm text-text-secondary">{t('companies.box.loadError')}</p>;
  }
  const company = companyResource.state.data;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-body-md-semibold text-text-primary">
        <CompanyNameLink companyId={company.id}>{company.name}</CompanyNameLink>
      </p>
      {[company.domain, company.city].some((value) => value) ? (
        <p className="text-body-sm text-text-secondary">
          {[company.domain, company.city].filter((value) => value).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

/** The offer "Is Priya with Infosys HR? (her email ends in infosys.com)" when the contact has a work email that a company of the business uses. */
function CompanySuggestion({ domain, onLink }: { domain: string; onLink: (company: Company) => void }) {
  const suggestionResource = useApiResource<CompaniesListResponse>(`/companies?domain=${encodeURIComponent(domain)}`);
  if (suggestionResource.state.status !== 'ready') return null;
  const [suggested] = suggestionResource.state.data.items;
  if (!suggested) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-surface-subtle p-3">
      <p className="text-body-md min-w-0 text-text-primary">
        {formatMessage('companies.box.suggestion', { name: suggested.name, domain })}
      </p>
      <Button size="compact" variant="primary" onClick={() => onLink(suggested)}>
        {formatMessage('companies.box.suggestionLink', { name: suggested.name })}
      </Button>
    </div>
  );
}

/**
 * The Company box on a contact's page: the company the contact is in (a link to its page), with Change and Take out; or, when there is none,
 * a search to pick one, and an offer of the company whose website domain matches the contact's work email. Every change is `PUT /contacts/{id}/company`.
 */
export function ContactCompanyCard({ contact, onChanged }: { contact: Contact; onChanged: () => void }) {
  const [isChoosing, setIsChoosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const suggestionDomain = findSuggestionDomain(contact.email);

  // Puts the contact in a company (or takes it out with null), then asks the page to load the contact again
  const setCompany = async (companyId: string | null) => {
    setIsSaving(true);
    setProblem(null);
    try {
      await apiRequest('PUT', `/contacts/${contact.id}/company`, { companyId });
      setIsChoosing(false);
      onChanged();
    } catch (error) {
      setProblem(describeCompanySaveProblem(error));
    }
    setIsSaving(false);
  };

  return (
    <Card aria-labelledby="contact-company-title">
      <h3 id="contact-company-title" className="text-heading-sm mb-3 text-text-primary">
        {t('companies.box.title')}
      </h3>
      {problem ? (
        <Alert tone="error" className="mb-3">
          {problem}
        </Alert>
      ) : null}
      {contact.companyId !== null && !isChoosing ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CompanyLine companyId={contact.companyId} />
          <div className="flex flex-wrap gap-2">
            <Button size="compact" onClick={() => setIsChoosing(true)} disabled={isSaving}>
              {t('companies.box.change')}
            </Button>
            <Button size="compact" onClick={() => void setCompany(null)} isLoading={isSaving}>
              {t('companies.box.takeOut')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {contact.companyId === null ? (
            <p className="text-body-md text-text-secondary">{t('companies.box.none')}</p>
          ) : null}
          {contact.companyId === null && suggestionDomain !== null ? (
            <CompanySuggestion domain={suggestionDomain} onLink={(company) => void setCompany(company.id)} />
          ) : null}
          {isChoosing || contact.companyId === null ? (
            <CompanyPicker onChoose={(company) => void setCompany(company.id)} />
          ) : null}
          {isChoosing ? (
            <div>
              <Button size="compact" onClick={() => setIsChoosing(false)}>
                {t('companies.box.cancel')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
