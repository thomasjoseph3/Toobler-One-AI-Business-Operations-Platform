import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type {
  BoardColumn,
  Lead,
  LeadsBoardResponse,
  LeadsResponse,
  Pipeline,
  PipelineStage,
  ViewsListResponse,
} from '@toobler-one/shared';
import { Alert, Button, Card, EmptyState, ErrorState, LeadsIcon, LoadingState, Pagination } from '@toobler-one/ui';
import { ApiRequestError, apiRequest } from '../../api/client';
import { useApiResource } from '../../api/useApiResource';
import { formatMessage, t } from '../../app/i18n';
import { useSession } from '../../auth/session';
import { useKeptData } from '../knowledge/use-kept-resource';
import { moveLeadInColumns } from './board-move';
import { describeShownRange } from './lead-display';
import { CreateLeadPanel } from './CreateLeadPanel';
import { useNoteCounts } from '../notes/useNoteCounts';
import { useNextTaskDates } from '../tasks/useNextTaskDates';
import { NotesPanel } from '../notes/NotesPanel';
import { TaskFormPanel } from '../tasks/TaskFormPanel';
import { LeadsBoard } from './LeadsBoard';
import { DeleteStageDialog } from './DeleteStageDialog';
import { StageNameDialog } from './StageNameDialog';
import { listOpenStageIdsInOrder, moveStageInOrder, type ColumnDirection } from './stage-order';
import { LeadCards, LeadsTable } from './LeadsTable';
import { LeadsToolbar } from './LeadsToolbar';
import { SaveViewDialog } from './SaveViewDialog';
import { findActiveSavedView, isPlainLeadsView } from './saved-views';
import { ViewTabs } from './ViewTabs';
import { maySeeViewActions, ViewActions } from './ViewActions';
import {
  buildLeadsPath,
  countActiveFilters,
  DEFAULT_LEADS_VIEW,
  LEADS_PAGE_SIZE,
  readLeadsView,
  writeLeadsView,
  type LeadsView,
} from './leads-view';
import { readNoticeFromState, useLeadActions } from './useLeadActions';

/** The Leads page fills the main area from 768 px, so the toolbar stays on top, the leads scroll and the footer stays at the bottom. */
const PAGE_FRAME_CLASSES = 'md:flex md:h-full md:min-h-0 md:flex-col';

/**
 * The Leads page: the toolbar (Filter, Sort, the List / Pipeline switch and Create lead), then the leads as a table (tablet and
 * desktop) or cards (phone), 25 to a page, or as a Pipeline board with a column per stage. What is shown (layout, status,
 * stage, owner, sort, page) lives in the web address, so a refresh or the Back button keeps it. The page's title is the top
 * bar's heading. It has a loading state, an error state with a retry, an empty state that points to the channels, and a
 * "nothing matches" state that offers to clear the filters.
 */
export function LeadsPage() {
  const { sessionState } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [selectedLeadIds, setSelectedLeadIds] = useState<ReadonlySet<string>>(new Set());
  // The Create lead panel: open or shut, and a counter so each opening starts with an empty form
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createPanelOpenCount, setCreatePanelOpenCount] = useState(0);
  // The lead whose Notes panel is open (the add-note icon of its row), or none
  const [notesLead, setNotesLead] = useState<{ id: string; displayName: string } | null>(null);
  // The lead the Add task form is open for (from the activity icon's menu in its row)
  const [taskLead, setTaskLead] = useState<{ id: string; displayName: string } | null>(null);
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null);
  // The box for naming a column: closed, adding a new one, or renaming one
  const [stageDialog, setStageDialog] = useState<{ stageToRename: PipelineStage | null } | null>(null);
  const view = readLeadsView(searchParams);
  const signedInUser =
    sessionState.status === 'signedIn'
      ? { id: sessionState.profile.user.id, role: sessionState.profile.user.role }
      : { id: '', role: '' };
  const leadsResource = useApiResource<LeadsResponse>(buildLeadsPath(view, signedInUser.id));
  const pipelineResource = useApiResource<Pipeline>('/pipeline');
  const viewsResource = useApiResource<ViewsListResponse>('/views?object=lead');
  // The "Save view" box: open or shut
  const [isSaveViewOpen, setIsSaveViewOpen] = useState(false);
  // What is on screen while a reload is under way: the last good answer, so the board never blanks out and flashes
  const leadsData = useKeptData(leadsResource.state);
  const pipelineData = useKeptData(pipelineResource.state);
  // How many notes each lead on the list has, for the orange notes icon (asked again after a note is added or deleted)
  const listedLeadIds =
    leadsData.data !== null && leadsData.data.view === 'list' ? leadsData.data.items.map((lead) => lead.id) : [];
  const noteCounts = useNoteCounts(listedLeadIds);
  // When each lead's next task is due, for the date in the Next activity column (asked again after a task is added)
  const nextTaskDates = useNextTaskDates(listedLeadIds);
  const stages = pipelineData.data?.stages ?? [];
  // The saved views for the tabs (none while they load or if they could not be loaded: the list itself still works)
  const savedViews = viewsResource.state.status === 'ready' ? viewsResource.state.data.items : [];
  const activeSavedView = findActiveSavedView(savedViews, view);
  // The board as the person has just changed it, before the server has answered; it is dropped as soon as a newer answer arrives
  const [boardOverride, setBoardOverride] = useState<{ source: LeadsBoardResponse; columns: BoardColumn[] } | null>(
    null,
  );
  // Shows a move on the board at once, and gives back what puts the card back if the server refuses it
  const applyMoveLocally = (lead: Lead, stage: PipelineStage) => {
    const shownAnswer = leadsData.data;
    if (shownAnswer === null || shownAnswer.view !== 'board') return () => undefined;
    const originalStageId = lead.stage.id;
    const changeColumns = (stageId: string) => (previous: typeof boardOverride) => {
      const startingColumns =
        previous !== null && previous.source === shownAnswer ? previous.columns : shownAnswer.columns;
      return { source: shownAnswer, columns: moveLeadInColumns(startingColumns, lead.id, stageId) };
    };
    setBoardOverride(changeColumns(stage.id));
    return () => setBoardOverride(changeColumns(originalStageId));
  };
  // Moving, assigning and deleting a lead, shared with the board and the lead page
  // A confirmation the lead page left behind ("The lead for Priya was deleted.") shows here first
  const actions = useLeadActions({
    stages,
    signedInUser,
    onChanged: leadsResource.reload,
    initialNotice: readNoticeFromState(location.state),
    applyMoveLocally,
  });

  // The guard around the app only shows this page to someone who is signed in; this keeps the types honest
  if (sessionState.status !== 'signedIn') return null;
  const { user, business } = sessionState.profile;

  // Changes part of the view. Anything but the page starts again at page 1, and the ticks are cleared: they belong to the leads that were on screen.
  const changeView = (changes: Partial<LeadsView>) => {
    setSelectedLeadIds(new Set());
    setSearchParams(writeLeadsView({ ...view, page: 1, ...changes }));
  };
  const clearFilters = () =>
    changeView({
      status: DEFAULT_LEADS_VIEW.status,
      stageId: DEFAULT_LEADS_VIEW.stageId,
      owner: DEFAULT_LEADS_VIEW.owner,
    });
  const reloadAll = () => {
    leadsResource.reload();
    pipelineResource.reload();
  };

  // Moves a column one place (reorders the open columns with POST /pipeline/stages/reorder) and shows the board again
  const moveColumn = async (stage: PipelineStage, direction: ColumnDirection) => {
    const newOrder = moveStageInOrder(listOpenStageIdsInOrder(stages), stage.id, direction);
    if (newOrder === null) return;
    try {
      await apiRequest('POST', '/pipeline/stages/reorder', { stageIds: newOrder });
      actions.showNotice({ tone: 'success', text: formatMessage('pipeline.notice.moved', { name: stage.name }) });
    } catch (error) {
      actions.showNotice({
        tone: 'error',
        text:
          error instanceof ApiRequestError && error.status === 403
            ? t('leads.error.forbidden')
            : t('leads.error.unknown'),
      });
    }
    reloadAll();
  };

  const openCreatePanel = () => {
    actions.dismissNotice();
    setCreatePanelOpenCount((count) => count + 1);
    setIsCreatePanelOpen(true);
  };
  // After a lead is created: close the panel, say so, and load the list again so the new lead shows
  const handleLeadCreated = (displayName: string) => {
    setIsCreatePanelOpen(false);
    actions.showNotice({ tone: 'success', text: formatMessage('leadForm.created', { name: displayName }) });
    leadsResource.reload();
  };

  const toolbar = (
    <>
      {actions.notice !== null ? (
        <Alert
          tone={actions.notice.tone}
          className="mb-4"
          action={
            <Button variant="link" onClick={actions.dismissNotice}>
              {t('leadForm.dismiss')}
            </Button>
          }
        >
          {actions.notice.text}
        </Alert>
      ) : null}
      <ViewTabs savedViews={savedViews} activeViewId={activeSavedView?.id} isPlain={isPlainLeadsView(view)} />
      {activeSavedView && maySeeViewActions(activeSavedView, user.role === 'manager') ? (
        <ViewActions
          key={activeSavedView.id}
          saved={activeSavedView}
          isManager={user.role === 'manager'}
          onChanged={(message) => {
            viewsResource.reload();
            actions.showNotice({ tone: 'success', text: message });
          }}
          onProblem={(message) => {
            viewsResource.reload();
            actions.showNotice({ tone: 'error', text: message });
          }}
        />
      ) : null}
      <LeadsToolbar
        view={view}
        stages={stages}
        onChangeView={changeView}
        onCreateLead={openCreatePanel}
        onSaveView={() => setIsSaveViewOpen(true)}
      />
      {isSaveViewOpen ? (
        <SaveViewDialog
          view={view}
          onClose={() => setIsSaveViewOpen(false)}
          onSaved={() => {
            setIsSaveViewOpen(false);
            viewsResource.reload();
            actions.showNotice({ tone: 'success', text: t('views.saved') });
          }}
        />
      ) : null}
      <CreateLeadPanel
        key={createPanelOpenCount}
        isOpen={isCreatePanelOpen}
        onClose={() => setIsCreatePanelOpen(false)}
        timeZone={business.timeZone}
        onCreated={handleLeadCreated}
      />
      {actions.dialogs}
      {taskLead !== null ? (
        <TaskFormPanel
          key={taskLead.id}
          isOpen
          onClose={() => setTaskLead(null)}
          timeZone={business.timeZone}
          forLead={taskLead}
          onCreated={(title) => {
            setTaskLead(null);
            nextTaskDates.reload();
            actions.showNotice({ tone: 'success', text: formatMessage('tasks.created', { title }) });
          }}
        />
      ) : null}
      {notesLead !== null ? (
        <NotesPanel
          key={notesLead.id}
          leadId={notesLead.id}
          leadName={notesLead.displayName}
          onClose={() => setNotesLead(null)}
          onChanged={noteCounts.reload}
        />
      ) : null}
      {stageToDelete !== null ? (
        <DeleteStageDialog
          stage={stageToDelete}
          otherOpenStages={stages.filter((stage) => stage.kind === 'open' && stage.id !== stageToDelete.id)}
          onClose={() => setStageToDelete(null)}
          onDeleted={(stageName) => {
            setStageToDelete(null);
            actions.showNotice({
              tone: 'success',
              text: formatMessage('pipeline.notice.deleted', { name: stageName }),
            });
            reloadAll();
          }}
        />
      ) : null}
      {stageDialog !== null ? (
        <StageNameDialog
          stageToRename={stageDialog.stageToRename}
          onClose={() => setStageDialog(null)}
          onSaved={(stageName) => {
            setStageDialog(null);
            actions.showNotice({
              tone: 'success',
              text: formatMessage(stageDialog.stageToRename ? 'pipeline.notice.renamed' : 'pipeline.notice.added', {
                name: stageName,
              }),
            });
            reloadAll();
          }}
        />
      ) : null}
    </>
  );

  if (leadsData.isFirstLoad || pipelineData.isFirstLoad) {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <LoadingState label={t('leads.loading')} rows={6} />
        </Card>
      </div>
    );
  }

  if (leadsData.hasFailed || pipelineData.hasFailed || leadsData.data === null) {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          <ErrorState
            title={t('leads.loadError.title')}
            description={t('leads.loadError.description')}
            action={<Button onClick={reloadAll}>{t('session.retry')}</Button>}
          />
        </Card>
      </div>
    );
  }

  const answer = leadsData.data;
  const totalLeads =
    answer.view === 'list' ? answer.total : answer.columns.reduce((total, column) => total + column.leadCount, 0);

  // The board is still shown when there are no leads, so its columns can be set up (and it says "No leads here yet" in each); only the list has an empty state
  if (totalLeads === 0 && answer.view === 'list') {
    const hasFilters = countActiveFilters(view) > 0;
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <Card>
          {hasFilters ? (
            <EmptyState
              icon={<LeadsIcon size={24} />}
              title={t('leads.noMatch.title')}
              description={t('leads.noMatch.description')}
              action={<Button onClick={clearFilters}>{t('leads.filter.clear')}</Button>}
            />
          ) : (
            <EmptyState
              icon={<LeadsIcon size={24} />}
              title={t('page.leads.emptyTitle')}
              description={t('page.leads.emptyDescription')}
              action={
                <Link
                  to="/channels"
                  className="text-body-md-semibold inline-flex h-10 items-center rounded-md bg-action px-4 text-action-text hover:bg-action-hover active:bg-action-pressed"
                >
                  {t('page.setUpChannels')}
                </Link>
              }
            />
          )}
        </Card>
      </div>
    );
  }

  // The Pipeline board: a column per stage
  if (answer.view === 'board') {
    return (
      <div className={PAGE_FRAME_CLASSES}>
        {toolbar}
        <LeadsBoard
          columns={boardOverride !== null && boardOverride.source === answer ? boardOverride.columns : answer.columns}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          stages={stages}
          renderRowMenu={actions.renderRowMenu}
          onMoveLead={actions.moveLeadToStage}
          canEditColumns={user.role === 'manager'}
          onRenameColumn={(stage) => setStageDialog({ stageToRename: stage })}
          onAddColumn={() => setStageDialog({ stageToRename: null })}
          onMoveColumn={(stage, direction) => void moveColumn(stage, direction)}
          onDeleteColumn={setStageToDelete}
        />
      </div>
    );
  }

  // The List: a table (tablet, desktop) or cards (phone), with Previous and Next under it
  const leads = answer;
  const openStageIdsInOrder = stages.filter((stage) => stage.kind === 'open').map((stage) => stage.id);
  const toggleLead = (leadId: string) => {
    const nextSelection = new Set(selectedLeadIds);
    if (nextSelection.has(leadId)) nextSelection.delete(leadId);
    else nextSelection.add(leadId);
    setSelectedLeadIds(nextSelection);
  };
  const toggleAllLeads = () => {
    const areAllSelected = leads.items.every((lead) => selectedLeadIds.has(lead.id));
    setSelectedLeadIds(areAllSelected ? new Set() : new Set(leads.items.map((lead) => lead.id)));
  };
  const lastPage = Math.max(1, Math.ceil(leads.total / LEADS_PAGE_SIZE));
  const summary = formatMessage(view.status === 'closed' ? 'leads.showingClosed' : 'leads.showing', {
    shown: describeShownRange(leads.page, leads.limit, leads.total),
    total: leads.total,
  });
  const footer = (
    <Pagination
      summary={summary}
      previousLabel={t('leads.previous')}
      nextLabel={t('leads.next')}
      ariaLabel={t('leads.pagination')}
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
        <LeadCards
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          renderRowMenu={actions.renderRowMenu}
          nextTaskDates={nextTaskDates.dates}
        />
        <div className="mt-3 overflow-hidden rounded-lg border border-border-default">{footer}</div>
      </div>
      <Card isFlush className="hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
        <LeadsTable
          leads={leads.items}
          openStageIdsInOrder={openStageIdsInOrder}
          signedInUserId={user.id}
          timeZone={business.timeZone}
          selectedLeadIds={selectedLeadIds}
          onToggleLead={toggleLead}
          onToggleAllLeads={toggleAllLeads}
          renderRowMenu={actions.renderRowMenu}
          onOpenNotes={(lead, displayName) => setNotesLead({ id: lead.id, displayName })}
          onCreateTask={(lead, displayName) => setTaskLead({ id: lead.id, displayName })}
          noteCounts={noteCounts.counts}
          nextTaskDates={nextTaskDates.dates}
        />
        {footer}
      </Card>
    </div>
  );
}
