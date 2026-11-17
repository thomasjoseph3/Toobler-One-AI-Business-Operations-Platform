import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { BusinessSettings, KnowledgeQuestionsResponse, SituationsResponse } from '@toobler-one/shared';
import { Button, ErrorState, LoadingState, Card } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { BusinessSettingsCard } from './BusinessSettingsCard';
import { KnowledgeTabs } from './KnowledgeTabs';
import { ProfileProgressCard } from './ProfileProgressCard';
import { ProfileSection } from './ProfileSection';
import { findWaitingQuestionKeys, groupQuestionsBySection } from './profile-state';
import { ReadWebsiteCard } from './ReadWebsiteCard';
import { useKeptData } from './use-kept-resource';
import { SituationsCard } from './SituationsCard';

/**
 * Knowledge base → Business profile: how complete the profile is, "read my website", the time and callback settings, every business
 * question in its section with its answer (answers from the website wait for Yes), and how the AI handles common situations.
 * Managers change things; staff read. It has loading and error states with a retry. The page's title is the top bar's heading.
 */
export function KnowledgePage() {
  const { sessionState } = useSession();
  const questionsResource = useApiResource<KnowledgeQuestionsResponse>('/knowledge/questions');
  const situationsResource = useApiResource<SituationsResponse>('/knowledge/situations');
  const settingsResource = useApiResource<BusinessSettings>('/knowledge/settings');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // While a save reloads the page, the answers already shown stay (nothing blanks, nothing typed is lost)
  const questionsData = useKeptData(questionsResource.state);
  const situationsData = useKeptData(situationsResource.state);
  const settingsData = useKeptData(settingsResource.state);
  const questions = questionsData.data?.questions ?? null;
  const questionTexts = useMemo(() => new Map((questions ?? []).map((question) => [question.key, question.text])), [questions]);
  const groups = useMemo(() => groupQuestionsBySection(questions ?? []), [questions]);

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const canEdit = sessionState.profile.user.role === 'manager';

  const reloadAll = () => {
    questionsResource.reload();
    situationsResource.reload();
    settingsResource.reload();
  };

  if (questionsData.isFirstLoad) return <LoadingState label={t('knowledge.loading')} />;
  if (questionsData.hasFailed || questionsData.data === null || questions === null) {
    return (
      <Card>
        <ErrorState
          title={t('knowledge.error.title')}
          description={t('knowledge.error.description')}
          action={<Button variant="secondary" onClick={reloadAll}>{t('knowledge.retry')}</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <KnowledgeTabs />
      <p className="text-body-md text-text-secondary">{t('knowledge.intro')}</p>
      {canEdit ? (
        <p className="text-body-md flex flex-wrap gap-x-6 gap-y-1 text-text-secondary">
          <Link to="/setup" className="text-link underline underline-offset-2 hover:text-link-hover">
            {t('knowledge.setupLink')}
          </Link>
        </p>
      ) : (
        <p className="text-body-md text-text-secondary">{t('knowledge.managersOnly')}</p>
      )}
      <ProfileProgressCard
        progress={questionsData.data.progress}
        questionTexts={questionTexts}
        waitingKeys={findWaitingQuestionKeys(questions)}
        canEdit={canEdit}
        onChanged={questionsResource.reload}
      />
      {canEdit ? <ReadWebsiteCard businessId={sessionState.profile.business.id} onFinished={questionsResource.reload} /> : null}
      {settingsData.data ? (
        <BusinessSettingsCard settings={settingsData.data} canEdit={canEdit} onSaved={settingsResource.reload} />
      ) : null}
      {groups.map((group) => (
        <ProfileSection
          key={group.section}
          group={group}
          canEdit={canEdit}
          editingKey={editingKey}
          onEdit={setEditingKey}
          onChanged={questionsResource.reload}
        />
      ))}
      {situationsData.data ? (
        <SituationsCard key={JSON.stringify(situationsData.data)} situations={situationsData.data.items} canEdit={canEdit} onChanged={situationsResource.reload} />
      ) : null}
    </div>
  );
}
