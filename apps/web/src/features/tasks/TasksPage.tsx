import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Task, TasksListResponse } from '@toobler-one/shared';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  PlusIcon,
  SegmentedControl,
  SelectField,
  TasksIcon,
} from '@toobler-one/ui';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { describeShownRange } from '../leads/lead-display';
import { useKeptData } from '../knowledge/use-kept-resource';
import { ListFilterPopover } from '../shared/ListFilterPopover';
import { TaskFormPanel } from './TaskFormPanel';
import { TaskCards, TasksTable } from './TasksList';
import { useTaskActions } from './useTaskActions';
import {
  buildTasksPath,
  countActiveTaskFilters,
  readTasksView,
  TASK_TABS,
  TASKS_PAGE_SIZE,
  writeTasksView,
  type TasksView,
} from './tasks-view';

/** The Tasks page fills the main area from 768 px, so the toolbar stays on top, the tasks scroll and the footer stays at the bottom (as on Leads). */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/**
 * The Tasks page, laid out like Leads and Tickets: the tabs (Overdue, Today, Upcoming, Done, each with its number), a Filter for whose
 * tasks, and Add task; then the tasks as a table (tablet and desktop) or cards (phone), 25 to a page, with Previous and Next under it.
 * What is shown lives in the web address, so a refresh or the Back button keeps it. It has loading, error (with retry), empty and
 * "nothing matches" states.
 */
export function TasksPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readTasksView(searchParams);
  const tasksResource = useApiResource<TasksListResponse>(buildTasksPath(view));
  const kept = useKeptData(tasksResource.state);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  // A counter so each opening of the panel starts with a fresh form
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // The task whose Edit form is open (from its "…" menu)
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const actions = useTaskActions({
    timeZone: sessionState.status === 'signedIn' ? sessionState.profile.business.timeZone : 'UTC',
    onChanged: () => tasksResource.reload(),
    onEdit: setEditingTask,
  });

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  // Changes part of the view. Anything but the page starts again at page 1.
  const changeView = (changes: Partial<TasksView>) => {
    setSearchParams(writeTasksView({ ...view, page: 1, ...changes }));
  };
  const openCreatePanel = () => {
    setNotice(null);
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  const handleTaskCreated = (title: string) => {
    setIsCreatePanelOpen(false);
    setNotice(formatMessage('tasks.created', { title }));
    tasksResource.reload();
  };

  const counts = kept.data?.counts;
  const toolbar = (
    <>
      {notice !== null ? (
        <Alert
          tone="success"
          className="mb-4"
          action={
            <Button variant="link" onClick={() => setNotice(null)}>
              {t('contacts.dismiss')}
            </Button>
          }
        >
          {notice}
        </Alert>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel={t('tasks.tabsLabel')}
            value={view.tab}
            onChange={(tab) => changeView({ tab })}
            options={TASK_TABS.map((tab) => ({
              value: tab.bucket,
              label: counts
                ? formatMessage('tasks.tabWithCount', { name: t(tab.labelKey), count: counts[tab.bucket] })
                : t(tab.labelKey),
            }))}
          />
          <ListFilterPopover panelLabel={t('tasks.filter.title')} activeFilterCount={countActiveTaskFilters(view)}>
            <SelectField
              label={t('tasks.filter.owner')}
              value={view.owner}
              onChange={(event) => changeView({ owner: event.target.value === 'me' ? 'me' : 'all' })}
              options={[
                { value: 'all', label: t('tasks.filter.everyone') },
                { value: 'me', label: t('tasks.filter.mine') },
              ]}
            />
          </ListFilterPopover>
        </div>
        <Button variant="primary" size="compact" leadingIcon={<PlusIcon size={16} />} onClick={openCreatePanel}>
          {t('tasks.add')}
        </Button>
      </div>
      {actions.problemNotice}
      {actions.dialogs}
      {editingTask !== null ? (
        <TaskFormPanel
          key={editingTask.id}
          isOpen
          onClose={() => setEditingTask(null)}
          timeZone={business.timeZone}
          editingTask={editingTask}
          onCreated={(title) => {
            setEditingTask(null);
            setNotice(formatMessage('tasks.edit.saved', { title }));
            tasksResource.reload();
          }}
        />
      ) : null}
      <TaskFormPanel
        key={createPanelOpenCount}
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        timeZone={business.timeZone}
        onCreated={handleTaskCreated}
      />
    </>
  );

  if (kept.isFirstLoad) {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <LoadingState label={t('tasks.loading')} rows={6} />
        </Card>
      </div>
    );
  }
  if (kept.hasFailed || kept.data === null) {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <ErrorState
            title={t('tasks.loadError.title')}
            description={t('tasks.loadError.description')}
            action={<Button onClick={tasksResource.reload}>{t('session.retry')}</Button>}
          />
        </Card>
      </div>
    );
  }
  const { items, total, page, limit } = kept.data;
  if (total === 0) {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <EmptyState
            icon={<TasksIcon size={24} />}
            title={t('tasks.empty.title')}
            description={t(`tasks.empty.${view.tab}`)}
            action={
              view.owner === 'me' ? (
                <Button onClick={() => changeView({ owner: 'all' })}>{t('tasks.showMine')}</Button>
              ) : (
                <Button variant="primary" onClick={openCreatePanel}>
                  {t('tasks.add')}
                </Button>
              )
            }
          />
        </Card>
      </div>
    );
  }

  const lastPage = Math.max(1, Math.ceil(total / TASKS_PAGE_SIZE));
  const footer = (
    <Pagination
      summary={formatMessage('tasks.showing', { shown: describeShownRange(page, limit, total), total })}
      previousLabel={t('leads.previous')}
      nextLabel={t('leads.next')}
      ariaLabel={t('tasks.pagination')}
      hasPrevious={view.page > 1}
      hasNext={view.page < lastPage}
      onPrevious={() => changeView({ page: view.page - 1 })}
      onNext={() => changeView({ page: view.page + 1 })}
    />
  );
  return (
    <div className={PAGE_FRAME_CLASSES}>
      {toolbar}
      <div className="md:hidden">
        <TaskCards
          tasks={items}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          onToggleDone={(task) => void actions.toggleDone(task)}
          renderRowMenu={actions.renderRowMenu}
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">{footer}</div>
      </div>
      <Card isFlush className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
        <TasksTable
          tasks={items}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          onToggleDone={(task) => void actions.toggleDone(task)}
          renderRowMenu={actions.renderRowMenu}
        />
        {footer}
      </Card>
    </div>
  );
}
