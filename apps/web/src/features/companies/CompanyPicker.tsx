import { useState } from 'react';
import type { Company } from '@toobler-one/shared';
import { TextField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { useCompanySearch } from './useCompanySearch';

/**
 * Finds a company to put a contact in: type a name, website or city, pick one from what is found (`GET /companies?q=`). It says what it is
 * doing: searching, nothing found, or could not search.
 */
export function CompanyPicker({ onChoose }: { onChoose: (company: Company) => void }) {
  const [searchText, setSearchText] = useState('');
  const search = useCompanySearch(searchText);
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t('companies.picker.label')}
        type="search"
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        autoComplete="off"
        helperText={t('companies.picker.hint')}
      />
      {search.status === 'searching' ? (
        <p role="status" className="text-body-sm text-text-secondary">
          {t('companies.picker.searching')}
        </p>
      ) : null}
      {search.status === 'error' ? (
        <p role="alert" className="text-body-sm text-error">
          {t('companies.picker.searchFailed')}
        </p>
      ) : null}
      {search.status === 'found' && search.companies.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('companies.picker.none')}</p>
      ) : null}
      {search.status === 'found' && search.companies.length > 0 ? (
        <ul className="flex flex-col overflow-hidden rounded-md border border-border-default">
          {search.companies.map((company) => (
            <li key={company.id} className="border-t border-border-subtle first:border-t-0">
              <button
                type="button"
                onClick={() => onChoose(company)}
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-hover"
              >
                <span className="text-body-md text-text-primary">{company.name}</span>
                <span className="text-body-xs text-text-secondary">
                  {[company.domain, company.city].filter((value) => value).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
