import { useState } from 'react';
import type { TasksListResponse } from '@toobler-one/shared';
import { Button, Card, ErrorState, LoadingState, PlusIcon } from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { CreateTaskPanel } from './CreateTaskPanel';
import { TaskCards } from './TasksList';
import { buildLeadTasksPath } from './tasks-view';

/**
 * The tasks of one lead on its own page: the open and finished ones, soonest first, and an Add task button that opens the same form as
 * the Tasks page, already about this lead. It keeps the tasks on screen while they load again.
 */
export function LeadTasksCard({ leadId, leadDisplayName }: { leadId: string; leadDisplayName: string }) {
  const { sessionState } = useSession();
  const resource = useApiResource<TasksListResponse>(buildLeadTasksPath(leadId));
  const kept = useKeptData(resource.state);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panelOpenCount, setPanelOpenCount] = useState(0);
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;
  const items = kept.data?.items ?? [];
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-heading-md text-text-primary">{t('leadPage.tasks.heading')}</h3>
        <Button
          size="compact"
          leadingIcon={<PlusIcon size={16} />}
          onClick={() => {
            setPanelOpenCount((count) => count + 1);
            setIsPanelOpen(true);
          }}
        >
          {t('tasks.add')}
        </Button>
      </div>
      {kept.isFirstLoad ? <LoadingState label={t('tasks.loading')} rows={2} /> : null}
      {kept.hasFailed ? (
        <ErrorState
          title={t('tasks.loadError.title')}
          description={t('tasks.loadError.description')}
          action={<Button onClick={resource.reload}>{t('session.retry')}</Button>}
        />
      ) : null}
      {kept.data !== null && items.length === 0 ? (
        <p className="text-body-md text-text-secondary">{t('leadPage.tasks.empty')}</p>
      ) : null}
      {items.length > 0 ? <TaskCards tasks={items} signedInUserId={user.id} timeZone={business.timeZone} /> : null}
      <CreateTaskPanel
        key={panelOpenCount}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        timeZone={business.timeZone}
        forLead={{ id: leadId, displayName: leadDisplayName }}
        onCreated={() => {
          setIsPanelOpen(false);
          resource.reload();
        }}
      />
    </Card>
  );
}
