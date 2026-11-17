import { useState } from 'react';
import type { Faq, FaqsResponse, UnansweredQuestion, UnansweredQuestionsResponse } from '@toobler-one/shared';
import { Button, Card, ErrorState, LoadingState } from '@toobler-one/ui';
import { apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { KnowledgeTabs } from '../knowledge/KnowledgeTabs';
import { useKeptData } from '../knowledge/use-kept-resource';
import { EMPTY_FAQ_FORM, formFromFaq, type FaqFormFields } from './faq-form';
import { FaqFormPanel } from './FaqFormPanel';
import { FaqsCard } from './FaqsCard';
import { SearchCard } from './SearchCard';
import { UnansweredCard } from './UnansweredCard';

/** What is open in the panel: a new FAQ, an FAQ being changed, or an unanswered question being answered. A counter makes each opening start fresh. */
type PanelContent = { kind: 'new' } | { kind: 'edit'; faq: Faq } | { kind: 'answer'; question: UnansweredQuestion };
type PanelState = PanelContent & { openings: number };

/**
 * Knowledge base → FAQs: the questions customers asked that the AI could not answer (answer or ignore), the FAQs the AI uses, and a box to see
 * what the AI's search would find. Anyone on the team may do all of it (owner decision, 13 Nov 2026). Loading and error states; it keeps what is on
 * screen while a change reloads. The page's title is the top bar's heading.
 */
export function FaqsPage() {
  const { sessionState } = useSession();
  const [showHistory, setShowHistory] = useState(false);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const faqsResource = useApiResource<FaqsResponse>('/knowledge/faqs');
  const unansweredResource = useApiResource<UnansweredQuestionsResponse>(
    showHistory ? '/knowledge/unanswered?include=history' : '/knowledge/unanswered',
  );
  const faqsData = useKeptData(faqsResource.state);
  const unansweredData = useKeptData(unansweredResource.state);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const timeZone = sessionState.profile.business.timeZone;

  if (faqsData.isFirstLoad) return <LoadingState label={t('faqs.loading')} />;
  if (faqsData.hasFailed || faqsData.data === null) {
    return (
      <Card>
        <ErrorState
          title={t('faqs.error.title')}
          description={t('knowledge.error.description')}
          action={
            <Button variant="secondary" onClick={faqsResource.reload}>
              {t('knowledge.retry')}
            </Button>
          }
        />
      </Card>
    );
  }

  const open = (next: PanelContent) => setPanel({ ...next, openings: (panel?.openings ?? 0) + 1 });
  const reloadAll = () => {
    faqsResource.reload();
    unansweredResource.reload();
  };

  const panelFields = (state: PanelState): FaqFormFields =>
    state.kind === 'edit'
      ? formFromFaq(state.faq)
      : state.kind === 'answer'
        ? { question: state.question.question, answer: '' }
        : EMPTY_FAQ_FORM;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <KnowledgeTabs />
      <p className="text-body-md text-text-secondary">{t('faqs.intro')}</p>
      <UnansweredCard
        questions={unansweredData.data?.items ?? []}
        showHistory={showHistory}
        onShowHistoryChange={setShowHistory}
        timeZone={timeZone}
        onAnswer={(question) => open({ kind: 'answer', question })}
        onChanged={reloadAll}
      />
      <FaqsCard
        faqs={faqsData.data.items}
        onAdd={() => open({ kind: 'new' })}
        onEdit={(faq) => open({ kind: 'edit', faq })}
        onChanged={reloadAll}
      />
      <SearchCard />
      {panel ? (
        <FaqFormPanel
          key={panel.openings}
          title={t(
            panel.kind === 'edit'
              ? 'faqs.form.editTitle'
              : panel.kind === 'answer'
                ? 'faqs.unanswered.panelTitle'
                : 'faqs.form.addTitle',
          )}
          editing={panel.kind === 'edit' ? panel.faq : null}
          startingFields={panelFields(panel)}
          {...(panel.kind === 'answer'
            ? {
                onSendAnswer: async (fields: FaqFormFields) => {
                  // The question may have been reworded; it is sent only when it was
                  const reworded = fields.question.replace(/\s+/g, ' ').trim() !== panel.question.question;
                  await apiRequest('POST', `/knowledge/unanswered/${panel.question.id}/answer`, {
                    answer: fields.answer.trim(),
                    ...(reworded ? { question: fields.question.replace(/\s+/g, ' ').trim() } : {}),
                  });
                },
              }
            : {})}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            reloadAll();
          }}
        />
      ) : null}
    </div>
  );
}
