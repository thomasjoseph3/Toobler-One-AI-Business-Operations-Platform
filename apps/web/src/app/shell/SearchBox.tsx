import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { GlobalSearchResponse } from '@toobler-one/shared';
import { SearchIcon, useDismissOnOutsidePress } from '@toobler-one/ui';
import { t } from '../i18n';
import { useGlobalSearch } from './useGlobalSearch';

/** One group of results with its heading (nothing when the group is empty). */
function ResultGroup({ heading, children, isEmpty }: { heading: string; children: ReactNode; isEmpty: boolean }) {
  if (isEmpty) return null;
  return (
    <section className="py-1">
      <h2 className="text-label-sm px-3 py-1 text-text-secondary">{heading}</h2>
      <ul>{children}</ul>
    </section>
  );
}

/** One result: a link to the record, with a main line and a smaller line under it. */
function ResultLink({
  to,
  main,
  detail,
  onChoose,
}: {
  to: string;
  main: string;
  detail: string | null;
  onChoose: () => void;
}) {
  return (
    <li>
      <Link
        to={to}
        onClick={onChoose}
        className="flex flex-col px-3 py-2 hover:bg-hover focus-visible:bg-hover [overflow-wrap:anywhere]"
      >
        <span className="text-body-md-semibold text-text-primary">{main}</span>
        {detail ? <span className="text-body-sm text-text-secondary">{detail}</span> : null}
      </Link>
    </li>
  );
}

/** Joins the parts that exist with " · " (a phone and an email, a stage and what the lead is about). */
function joinParts(parts: ReadonlyArray<string | null>): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== '');
  return present.length === 0 ? null : present.join(' · ');
}

/** The results panel's content for what was found. */
function FoundResults({ results, onChoose }: { results: GlobalSearchResponse; onChoose: () => void }) {
  const nothingFound = results.contacts.length + results.companies.length + results.leads.length === 0;
  if (nothingFound) return <p className="text-body-md px-3 py-4 text-text-secondary">{t('search.nothingFound')}</p>;
  return (
    <>
      <ResultGroup heading={t('search.contacts')} isEmpty={results.contacts.length === 0}>
        {results.contacts.map((person) => (
          <ResultLink
            key={person.id}
            to={`/contacts/${person.id}`}
            main={person.name ?? person.phone ?? person.email ?? t('search.unnamed')}
            detail={joinParts([person.name ? person.phone : null, person.email])}
            onChoose={onChoose}
          />
        ))}
      </ResultGroup>
      <ResultGroup heading={t('search.companies')} isEmpty={results.companies.length === 0}>
        {results.companies.map((company) => (
          <ResultLink
            key={company.id}
            to={`/companies/${company.id}`}
            main={company.name}
            detail={joinParts([company.domain, company.city])}
            onChoose={onChoose}
          />
        ))}
      </ResultGroup>
      <ResultGroup heading={t('search.leads')} isEmpty={results.leads.length === 0}>
        {results.leads.map((lead) => (
          <ResultLink
            key={lead.id}
            to={`/leads/${lead.id}`}
            main={lead.contactName ?? lead.contactPhone ?? t('search.unnamed')}
            detail={joinParts([lead.stageName, lead.interest])}
            onChoose={onChoose}
          />
        ))}
      </ResultGroup>
    </>
  );
}

/**
 * The search box in the top bar (F11): type two letters or more and, a moment after typing stops, the people, companies and leads that match
 * are listed under it (at most 5 of each), each a link to its page. It says when it is searching, when nothing matches and when the search
 * failed. Escape or a press outside closes the list; choosing a result closes it and clears the box.
 */
export function SearchBox({ className }: { className?: string }) {
  const [typedText, setTypedText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useGlobalSearch(typedText);
  useDismissOnOutsidePress(containerRef, isOpen, () => setIsOpen(false));

  // Closes the list and empties the box after a result was chosen
  const handleChoose = () => {
    setIsOpen(false);
    setTypedText('');
  };

  let panelBody: ReactNode;
  if (state.status === 'tooShort')
    panelBody = <p className="text-body-md px-3 py-4 text-text-secondary">{t('search.typeMore')}</p>;
  else if (state.status === 'searching')
    panelBody = <p className="text-body-md px-3 py-4 text-text-secondary">{t('search.searching')}</p>;
  else if (state.status === 'error')
    panelBody = (
      <p role="alert" className="text-body-md px-3 py-4 text-error">
        {t('search.error')}
      </p>
    );
  else panelBody = <FoundResults results={state.results} onChoose={handleChoose} />;

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <label className="flex h-9 w-full items-center gap-2 rounded-md border border-border-default bg-input px-3">
        <SearchIcon size={18} className="shrink-0 text-icon-secondary" />
        <span className="sr-only">{t('topBar.search')}</span>
        <input
          type="search"
          value={typedText}
          onChange={(event) => {
            setTypedText(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={`${t('topBar.search')}…`}
          autoComplete="off"
          className="text-body-md min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-placeholder"
        />
      </label>
      {isOpen && typedText.trim() !== '' ? (
        <div
          role="region"
          aria-label={t('search.results')}
          aria-live="polite"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-[70vh] min-w-[280px] overflow-y-auto rounded-md border border-border-default bg-surface shadow-md"
        >
          {panelBody}
        </div>
      ) : null}
    </div>
  );
}
