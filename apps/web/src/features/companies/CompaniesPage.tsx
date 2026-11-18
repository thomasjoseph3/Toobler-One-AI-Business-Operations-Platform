import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { CompaniesListResponse } from '@toobler-one/shared';
import {
  Alert,
  Button,
  buttonClasses,
  Card,
  CompaniesIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  PlusIcon,
  TextField,
} from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { useSession } from '../../auth/session';
import { ExportButton } from '../exports/ExportButton';
import { buildCompaniesExportRequest } from '../exports/exports-state';
import { useFieldDefinitions } from '../fields/use-field-definitions';
import { ConditionsEditor } from '../shared/ConditionsEditor';
import { listFilterableCustomFields } from '../shared/filter-conditions-ui';
import { ListFilterPopover } from '../shared/ListFilterPopover';
import { formatMessage, t } from '../../app/i18n';
import { describeShownRange } from '../leads/lead-display';
import { CompaniesTable, CompanyCards } from './CompaniesList';
import { CompanyFormPanel } from './CompanyFormPanel';
import {
  buildCompaniesPath,
  COMPANIES_PAGE_SIZE,
  DEFAULT_COMPANIES_VIEW,
  readCompaniesView,
  writeCompaniesView,
  type CompaniesView,
} from './companies-view';

/** The Companies page fills the main area from 768 px, so the toolbar stays on top, the companies scroll and the footer stays at the bottom (as on Leads). */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/** How long to wait after the last key press before searching, so typing does not search on every letter. */
const SEARCH_DELAY_MILLISECONDS = 300;

/** Reads the message another page left behind in the navigation (for example "Infosys HR was deleted."), or nothing. */
function readNoticeFromState(state: unknown): string | null {
  const notice = (state as { notice?: { text?: unknown } } | null)?.notice;
  return typeof notice?.text === 'string' ? notice.text : null;
}

/**
 * The Companies page, laid out like the Contacts page: the toolbar (search and Add company), then the companies as a table (tablet and desktop)
 * or cards (phone), 25 to a page, with Previous and Next under it. What is shown (search, page) lives in the web address, so a refresh or the Back
 * button keeps it. It has loading, error (with retry), empty ("no companies yet") and "nothing matches" states.
 */
export function CompaniesPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readCompaniesView(searchParams);
  const { sessionState } = useSession();
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  const filterableFields = listFilterableCustomFields(useFieldDefinitions('company'));
  const companiesResource = useApiResource<CompaniesListResponse>(buildCompaniesPath(view));
  const [typedSearch, setTypedSearch] = useState(view.searchText);
  const [isFormOpen, setIsFormOpen] = useState(false);
  // A counter so each opening of the form starts with an empty one
  const [formOpenCount, setFormOpenCount] = useState(0);
  // A confirmation the company page left behind ("Infosys HR was deleted.") shows first
  const [notice, setNotice] = useState<string | null>(readNoticeFromState(location.state));

  // Applies the typed search a moment after the typing stops
  useEffect(() => {
    if (typedSearch.trim() === view.searchText.trim()) return;
    const timer = setTimeout(
      () =>
        setSearchParams(writeCompaniesView({ ...DEFAULT_COMPANIES_VIEW, ...view, page: 1, searchText: typedSearch })),
      SEARCH_DELAY_MILLISECONDS,
    );
    return () => clearTimeout(timer);
  }, [typedSearch, view, setSearchParams]);

  const changeView = (changes: Partial<CompaniesView>) => setSearchParams(writeCompaniesView({ ...view, ...changes }));
  const openForm = () => {
    setNotice(null);
    setFormOpenCount((count) => count + 1);
    setIsFormOpen(true);
  };
  const clearSearch = () => {
    setTypedSearch('');
    setSearchParams(writeCompaniesView(DEFAULT_COMPANIES_VIEW));
  };

  const toolbar = (
    <>
      {notice !== null ? (
        <Alert
          tone="success"
          className="mb-4"
          action={
            <Button variant="link" onClick={() => setNotice(null)}>
              {t('companies.dismiss')}
            </Button>
          }
        >
          {notice}
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
          <div className="w-full min-w-0 md:w-72">
            <TextField
              label={t('companies.search')}
              type="search"
              size="compact"
              isLabelHidden
              value={typedSearch}
              onChange={(event) => setTypedSearch(event.target.value)}
              autoComplete="off"
              placeholder={t('companies.search')}
            />
          </div>
          {/* Only when the business has company fields of its own to filter on */}
          {filterableFields.length > 0 ? (
            <ListFilterPopover panelLabel={t('companies.filter.title')} activeFilterCount={view.conditions.length}>
              <ConditionsEditor
                key={JSON.stringify(view.conditions)}
                fields={filterableFields}
                applied={view.conditions}
                onApply={(conditions) => changeView({ conditions, page: 1 })}
              />
              <Button
                variant="tertiary"
                size="compact"
                disabled={view.conditions.length === 0}
                onClick={() => changeView({ conditions: [], page: 1 })}
              >
                {t('leads.filter.clear')}
              </Button>
            </ListFilterPopover>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/companies/duplicates" className={buttonClasses('secondary', 'compact')}>
            {t('duplicates.link')}
          </Link>
          {isManager ? <ExportButton request={buildCompaniesExportRequest(view)} /> : null}
          <Button variant="primary" size="compact" leadingIcon={<PlusIcon size={16} />} onClick={openForm}>
            {t('companies.add')}
          </Button>
        </div>
      </div>
      <CompanyFormPanel
        key={formOpenCount}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSaved={(companyName) => {
          setIsFormOpen(false);
          setNotice(formatMessage('companies.created', { name: companyName }));
          companiesResource.reload();
        }}
      />
    </>
  );

  const state = companiesResource.state;
  if (state.status === 'loading') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <LoadingState label={t('companies.loading')} rows={6} />
        </Card>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <ErrorState
            title={t('companies.loadError.title')}
            description={t('companies.loadError.description')}
            action={<Button onClick={companiesResource.reload}>{t('session.retry')}</Button>}
          />
        </Card>
      </div>
    );
  }
  if (state.data.total === 0) {
    const isSearching = view.searchText.trim() !== '';
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          {isSearching ? (
            <EmptyState
              icon={<CompaniesIcon size={24} />}
              title={t('companies.noMatch.title')}
              description={t('companies.noMatch.description')}
              action={<Button onClick={clearSearch}>{t('companies.clear')}</Button>}
            />
          ) : (
            <EmptyState
              icon={<CompaniesIcon size={24} />}
              title={t('page.companies.emptyTitle')}
              description={t('page.companies.emptyDescription')}
              action={
                <Button variant="primary" onClick={openForm}>
                  {t('companies.add')}
                </Button>
              }
            />
          )}
        </Card>
      </div>
    );
  }

  // The list: a table (tablet, desktop) or cards (phone), with Previous and Next under it
  const { items, total, page, limit } = state.data;
  const lastPage = Math.max(1, Math.ceil(total / COMPANIES_PAGE_SIZE));
  return (
    <div className={PAGE_FRAME_CLASSES}>
      {toolbar}
      <div className="md:hidden">
        <CompanyCards companies={items} />
      </div>
      <div className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
        <CompaniesTable companies={items} />
      </div>
      <Pagination
        summary={formatMessage('companies.showing', { shown: describeShownRange(page, limit, total), total })}
        previousLabel={t('leads.previous')}
        nextLabel={t('leads.next')}
        ariaLabel={t('companies.pagination')}
        hasPrevious={view.page > 1}
        hasNext={view.page < lastPage}
        onPrevious={() => changeView({ page: view.page - 1 })}
        onNext={() => changeView({ page: view.page + 1 })}
      />
    </div>
  );
}
