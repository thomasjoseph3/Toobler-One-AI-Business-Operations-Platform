import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import type { DuplicateObject, DuplicatesListResponse, DuplicateSuggestion, PairSide } from '@toobler-one/shared';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  ContactsIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  Tag,
} from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import {
  buildMergeRequest,
  describeDuplicatesProblem,
  describeRecord,
  listComparedFields,
  REASON_MESSAGE_KEYS,
} from './duplicates-state';

/** One pair: why it matches, the two records side by side with a choice for each field that differs, and the Merge and Not the same buttons. */
function DuplicatePairCard({
  suggestion,
  customFields,
  isManager,
  onDecided,
}: {
  suggestion: DuplicatesListResponse['items'][number];
  customFields: DuplicatesListResponse['fields'];
  isManager: boolean;
  onDecided: (message: string) => void;
}) {
  const [keep, setKeep] = useState<PairSide>('a');
  const [choices, setChoices] = useState<Record<string, PairSide>>({});
  const [isAsking, setIsAsking] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const lines = listComparedFields(suggestion, customFields);
  const bothHaveOpenLead = suggestion.aHasOpenLead && suggestion.bHasOpenLead;
  const namedFirst = describeRecord(suggestion.a);
  const namedSecond = describeRecord(suggestion.b);
  const groupName = `pair-${suggestion.id}`;

  // Merges the pair into the record staff chose to keep
  async function merge() {
    setIsBusy(true);
    setProblem(null);
    try {
      await apiRequest('POST', `/duplicates/${suggestion.id}/merge`, buildMergeRequest(keep, lines, choices));
      onDecided(formatMessage('duplicates.merged.done', { name: keep === 'a' ? namedFirst : namedSecond }));
    } catch (error) {
      setProblem(describeDuplicatesProblem(error));
      setIsAsking(false);
    } finally {
      setIsBusy(false);
    }
  }

  // Says the two are different people (or firms), for good
  async function dismiss() {
    setIsBusy(true);
    setProblem(null);
    try {
      await apiRequest('POST', `/duplicates/${suggestion.id}/dismiss`);
      onDecided(formatMessage('duplicates.dismissed.done', { first: namedFirst, second: namedSecond }));
    } catch (error) {
      setProblem(describeDuplicatesProblem(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-body-md-semibold text-text-primary">{t('duplicates.why')}</span>
        {suggestion.reasons.map((reason) => (
          <Tag key={reason} tone="neutral">
            {t(REASON_MESSAGE_KEYS[reason])}
          </Tag>
        ))}
      </div>
      {problem ? (
        <Alert tone="error" className="mb-3">
          {problem}
        </Alert>
      ) : null}
      {bothHaveOpenLead ? (
        <Alert tone="error" className="mb-3">
          {t('duplicates.bothOpenLeads')}
        </Alert>
      ) : null}
      <fieldset className="mb-3">
        <legend className="text-body-md-semibold mb-1 text-text-primary">{t('duplicates.keep')}</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          {(['a', 'b'] as const).map((side) => (
            <label key={side} className="text-body-md flex items-center gap-2 text-text-primary">
              <input type="radio" name={`${groupName}-keep`} checked={keep === side} onChange={() => setKeep(side)} />
              {side === 'a' ? namedFirst : namedSecond}
              <span className="text-text-secondary">
                {formatMessage('duplicates.addedOn', {
                  date: new Date(side === 'a' ? suggestion.a.createdAt : suggestion.b.createdAt).toLocaleDateString(),
                })}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* Stacked on a phone (each line is its own small block), a three-column table from small screens up */}
      <div role="table" aria-label={t('duplicates.compare')} className="mb-3 text-body-md">
        <div
          role="row"
          className="hidden grid-cols-[10rem_1fr_1fr] gap-2 border-b border-border pb-1 text-text-secondary sm:grid"
        >
          <span role="columnheader">{t('duplicates.column.field')}</span>
          <span role="columnheader">{namedFirst}</span>
          <span role="columnheader">{namedSecond}</span>
        </div>
        {lines.map((line) => (
          <div
            key={line.id}
            role="row"
            className="grid grid-cols-1 gap-1 border-b border-border py-2 sm:grid-cols-[10rem_1fr_1fr] sm:gap-2"
          >
            <span role="rowheader" className="text-body-md-semibold text-text-primary">
              {line.label}
            </span>
            {(['a', 'b'] as const).map((side) => {
              const value = side === 'a' ? line.firstValue : line.secondValue;
              const chosen = choices[line.id] ?? keep;
              return (
                <span
                  key={side}
                  role="cell"
                  className="flex items-center gap-2 text-text-primary [overflow-wrap:anywhere]"
                >
                  {line.differs ? (
                    <input
                      type="radio"
                      name={`${groupName}-${line.id}`}
                      aria-label={formatMessage('duplicates.useValue', { value, field: line.label })}
                      checked={chosen === side}
                      onChange={() => setChoices({ ...choices, [line.id]: side })}
                    />
                  ) : null}
                  {value}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {isManager ? (
          <Button variant="primary" disabled={isBusy || bothHaveOpenLead} onClick={() => setIsAsking(true)}>
            {t('duplicates.merge')}
          </Button>
        ) : null}
        <Button variant="secondary" disabled={isBusy} onClick={() => void dismiss()}>
          {t('duplicates.notTheSame')}
        </Button>
      </div>
      {!isManager ? <p className="text-body-sm mt-2 text-text-secondary">{t('duplicates.managersMerge')}</p> : null}
      <ConfirmDialog
        isOpen={isAsking}
        title={formatMessage('duplicates.merge.title', { first: namedFirst, second: namedSecond })}
        description={t('duplicates.merge.description')}
        confirmLabel={t('duplicates.merge')}
        cancelLabel={t('duplicates.merge.cancel')}
        closeLabel={t('duplicates.merge.close')}
        tone="danger"
        isConfirming={isBusy}
        onConfirm={() => void merge()}
        onCancel={() => setIsAsking(false)}
      />
    </Card>
  );
}

/**
 * Possible duplicates (`/contacts/duplicates` and `/companies/duplicates`): pairs of contacts, or of companies, that look like the same one, found
 * every night. Staff compare them side by side and say "Not the same"; managers pick what to keep and merge (after "Are you sure?").
 * Loading, error (with a retry) and empty states.
 */
export function DuplicatesPage({ object }: { object: DuplicateObject }) {
  const { sessionState } = useSession();
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';
  const resource = useApiResource<DuplicatesListResponse>(`/duplicates?object=${object}`);
  const [notice, setNotice] = useState<string | null>(null);
  const backPath = object === 'contact' ? '/contacts' : '/companies';

  let body;
  if (resource.state.status === 'loading') {
    body = <LoadingState label={t('duplicates.loading')} rows={4} />;
  } else if (resource.state.status === 'error') {
    body = (
      <ErrorState
        title={t('duplicates.loadError.title')}
        description={t('duplicates.loadError.description')}
        action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
      />
    );
  } else if (resource.state.data.items.length === 0) {
    body = (
      <EmptyState
        icon={<ContactsIcon size={24} />}
        title={t('duplicates.empty.title')}
        description={t('duplicates.empty.description')}
      />
    );
  } else {
    const { items, fields } = resource.state.data;
    body = items.map((suggestion: DuplicateSuggestion) => (
      <DuplicatePairCard
        key={suggestion.id}
        suggestion={suggestion}
        customFields={fields}
        isManager={isManager}
        onDecided={(message) => {
          setNotice(message);
          resource.reload();
        }}
      />
    ));
  }

  return (
    <>
      <Link
        to={backPath}
        className="text-body-md-semibold mb-4 inline-flex items-center gap-1 text-link hover:text-link-hover"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t(object === 'contact' ? 'duplicates.back.contacts' : 'duplicates.back.companies')}
      </Link>
      <h2 className="text-heading-lg text-text-primary">{t('duplicates.heading')}</h2>
      <p className="text-body-md mb-4 text-text-secondary">{t('duplicates.description')}</p>
      {notice ? (
        <Alert tone="success" className="mb-4">
          {notice}
        </Alert>
      ) : null}
      {body}
    </>
  );
}
