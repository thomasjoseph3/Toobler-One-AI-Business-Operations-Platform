import { useEffect, useState } from 'react';
import type { Offering, OfferingsResponse, OffersResponse, PrefillRun, SuggestedOffering } from '@toobler-one/shared';
import { Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { KnowledgeTabs } from '../knowledge/KnowledgeTabs';
import { recallReading } from '../knowledge/last-reading';
import { useKeptData } from '../knowledge/use-kept-resource';
import { pickSuggestionsToShow, suggestionKey } from './list-helpers';
import { EMPTY_OFFERING_FORM, formFromOffering, formFromSuggestion, type OfferingFormFields } from './offering-form';
import { OfferingFormPanel } from './OfferingFormPanel';
import { OfferingsCard } from './OfferingsCard';
import { OffersCard } from './OffersCard';
import { SuggestionsCard } from './SuggestionsCard';

/** What is open in the offering panel: nothing, or a form (new, from a suggestion, or an offering being changed). A counter makes each opening start fresh. */
interface PanelState {
  editing: Offering | null;
  fields: OfferingFormFields;
  openings: number;
}

/**
 * Knowledge base → What you sell: the things the business sells (with "from" prices), what the website reading suggests, and the offers running
 * now. Managers add, change, switch on or off, reorder and delete; staff read. It has loading and error states and keeps what is on screen
 * while a change reloads. The page's title is the top bar's heading.
 */
export function WhatYouSellPage() {
  const { sessionState } = useSession();
  const [showEnded, setShowEnded] = useState(false);
  const offeringsResource = useApiResource<OfferingsResponse>('/offerings');
  const offersResource = useApiResource<OffersResponse>(showEnded ? '/offers?include=expired' : '/offers');
  const offeringsData = useKeptData(offeringsResource.state);
  const offersData = useKeptData(offersResource.state);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [lastReading, setLastReading] = useState<PrefillRun | null>(null);
  const [dismissedNames, setDismissedNames] = useState<ReadonlySet<string>>(new Set());
  const businessId = sessionState.status === 'signedIn' ? sessionState.profile.business.id : null;
  const isManager = sessionState.status === 'signedIn' && sessionState.profile.user.role === 'manager';

  // Look up the reading this browser last started, to offer what it found (only a manager can read it)
  useEffect(() => {
    if (businessId === null || !isManager) return;
    const runId = recallReading(businessId);
    if (runId === null) return;
    let isCancelled = false;
    apiRequest<PrefillRun>('GET', `/knowledge/prefill/${runId}`)
      .then((run) => {
        if (!isCancelled && run.status === 'done') setLastReading(run);
      })
      .catch(() => {
        // The offer is a convenience: if the reading cannot be found, the page simply does not show it
      });
    return () => {
      isCancelled = true;
    };
  }, [businessId, isManager]);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const canEdit = isManager;
  const timeZone = sessionState.profile.business.timeZone;

  if (offeringsData.isFirstLoad) return <LoadingState label={t('whatYouSell.loading')} />;
  if (offeringsData.hasFailed || offeringsData.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('whatYouSell.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={offeringsResource.reload}>
              {t('knowledge.retry')}
            </Button>
          }
        />
      </Card>
    );
  }

  const offerings = offeringsData.data.items;
  const suggestions = pickSuggestionsToShow(
    lastReading?.suggestedOfferings ?? [],
    offerings.map((offering) => offering.name),
    dismissedNames,
  );
  const openPanel = (editing: Offering | null, fields: OfferingFormFields) =>
    setPanel({ editing, fields, openings: (panel?.openings ?? 0) + 1 });
  const dismiss = (suggestion: SuggestedOffering) =>
    setDismissedNames((earlier) => new Set([...earlier, suggestionKey(suggestion)]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <KnowledgeTabs />
      <p className="text-body-md text-text-secondary">{t('whatYouSell.intro')}</p>
      {canEdit ? null : <p className="text-body-md text-text-secondary">{t('whatYouSell.managersOnly')}</p>}
      {canEdit ? (
        <SuggestionsCard
          suggestions={suggestions}
          onAdd={(suggestion) => openPanel(null, formFromSuggestion(suggestion))}
          onDismiss={dismiss}
        />
      ) : null}
      <OfferingsCard
        offerings={offerings}
        canEdit={canEdit}
        onAdd={() => openPanel(null, EMPTY_OFFERING_FORM)}
        onEdit={(offering) => openPanel(offering, formFromOffering(offering))}
        onChanged={offeringsResource.reload}
      />
      <OffersCard
        offers={offersData.data?.items ?? []}
        showEnded={showEnded}
        onShowEndedChange={setShowEnded}
        canEdit={canEdit}
        timeZone={timeZone}
        onChanged={offersResource.reload}
      />
      {panel ? (
        <OfferingFormPanel
          key={panel.openings}
          isOpen
          editing={panel.editing}
          startingFields={panel.fields}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            offeringsResource.reload();
          }}
        />
      ) : null}
    </div>
  );
}
