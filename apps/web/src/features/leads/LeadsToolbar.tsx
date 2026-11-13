import { useState } from 'react';
import type { PipelineStage } from '@toobler-one/shared';
import {
  Button,
  ExportIcon,
  FilterIcon,
  ImportIcon,
  ListViewIcon,
  Popover,
  PlusIcon,
  SegmentedControl,
  SelectField,
  SortIcon,
  SplitViewIcon,
} from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import {
  countActiveFilters,
  DEFAULT_LEADS_VIEW,
  describeOrder,
  describeSort,
  findDefaultOrder,
  findStageChoices,
  LEADS_SORTS,
  type LeadsOrder,
  type LeadsView,
} from './leads-view';

/** What a control that is drawn as designed but does not work yet does when pressed: nothing. */
const doNothingYet = () => undefined;

/** The props that mark a button as "drawn, not working yet": screen readers hear it is unavailable, and the tooltip says so. */
const notWorkingYet = { 'aria-disabled': true, title: t('leads.notYet'), onClick: doNothingYet } as const;

export interface LeadsToolbarProps {
  view: LeadsView;
  /** Every stage of the pipeline, for the Stage filter. Empty while the pipeline is still loading. */
  stages: readonly PipelineStage[];
  /** Changes part of the view (a filter, the sort, the page). Any change other than the page starts again at page 1. */
  onChangeView: (changes: Partial<LeadsView>) => void;
}

/** The Filter panel: which leads to show (open or closed, one stage, only mine). It applies as soon as a choice is made. */
function FilterPanel({ view, stages, onChangeView }: LeadsToolbarProps) {
  const stageChoices = findStageChoices(stages, view.status);
  const filtersAreOn = countActiveFilters(view) > 0;
  return (
    <>
      <SelectField
        label={t('leads.filter.status')}
        value={view.status}
        options={[
          { value: 'open', label: t('leads.filter.status.open') },
          { value: 'closed', label: t('leads.filter.status.closed') },
        ]}
        // The stage the person had picked may not belong to the other status, so it is cleared
        onChange={(event) =>
          onChangeView({ status: event.target.value === 'closed' ? 'closed' : 'open', stageId: null })
        }
      />
      <SelectField
        label={t('leads.filter.stage')}
        value={view.stageId ?? ''}
        options={[
          { value: '', label: t('leads.filter.stage.any') },
          ...stageChoices.map((stage) => ({ value: stage.id, label: stage.name })),
        ]}
        onChange={(event) => onChangeView({ stageId: event.target.value === '' ? null : event.target.value })}
      />
      <SelectField
        label={t('leads.filter.owner')}
        value={view.owner}
        options={[
          { value: 'anyone', label: t('leads.filter.owner.anyone') },
          { value: 'me', label: t('leads.filter.owner.me') },
        ]}
        onChange={(event) => onChangeView({ owner: event.target.value === 'me' ? 'me' : 'anyone' })}
      />
      <Button
        variant="tertiary"
        size="compact"
        disabled={!filtersAreOn}
        onClick={() =>
          onChangeView({
            status: DEFAULT_LEADS_VIEW.status,
            stageId: DEFAULT_LEADS_VIEW.stageId,
            owner: DEFAULT_LEADS_VIEW.owner,
          })
        }
      >
        {t('leads.filter.clear')}
      </Button>
    </>
  );
}

/** The Sort panel: what to order by, and which way. Picking a sort starts it in its usual direction. */
function SortPanel({ view, onChangeView }: Pick<LeadsToolbarProps, 'view' | 'onChangeView'>) {
  // The direction that suits the sort comes first in the list
  const firstOrder = findDefaultOrder(view.sort);
  const orderChoices: readonly LeadsOrder[] = firstOrder === 'asc' ? ['asc', 'desc'] : ['desc', 'asc'];
  return (
    <>
      <SelectField
        label={t('leads.sort.by')}
        value={view.sort}
        options={LEADS_SORTS.map((sort) => ({ value: sort, label: describeSort(sort) }))}
        onChange={(event) => {
          const sort = LEADS_SORTS.find((candidate) => candidate === event.target.value) ?? DEFAULT_LEADS_VIEW.sort;
          onChangeView({ sort, order: findDefaultOrder(sort) });
        }}
      />
      <SelectField
        label={t('leads.sort.order')}
        value={view.order}
        options={orderChoices.map((order) => ({ value: order, label: describeOrder(view.sort, order) }))}
        onChange={(event) => onChangeView({ order: event.target.value === 'asc' ? 'asc' : 'desc' })}
      />
    </>
  );
}

/**
 * The row of controls above the leads (Figma toolbar): Filter, Sort and the List / Split view switch on the left; Import,
 * Export and Create lead on the right. Filter and Sort work. The rest are drawn exactly as designed and do nothing yet: Create
 * lead has its API (its screen is the next slice), Import and Export wait for F12, and Split view has no description yet.
 */
export function LeadsToolbar({ view, stages, onChangeView }: LeadsToolbarProps) {
  const [chosenView, setChosenView] = useState<'list' | 'split'>('list');
  const activeFilterCount = countActiveFilters(view);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Popover
          panelLabel={t('leads.filter.title')}
          renderTrigger={({ isOpen, toggle }) => (
            <Button
              size="compact"
              leadingIcon={<FilterIcon size={15} />}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              onClick={toggle}
            >
              {t('leads.toolbar.filter')}
              {activeFilterCount > 0 ? (
                <>
                  {/* A number as well as a colour: how many filters are on */}
                  <span aria-hidden className="text-label-xs rounded-full bg-action px-1.5 text-action-text">
                    {activeFilterCount}
                  </span>
                  <span className="sr-only">{formatMessage('leads.activeFilters', { count: activeFilterCount })}</span>
                </>
              ) : null}
            </Button>
          )}
        >
          <FilterPanel view={view} stages={stages} onChangeView={onChangeView} />
        </Popover>
        <Popover
          panelLabel={t('leads.sort.title')}
          renderTrigger={({ isOpen, toggle }) => (
            <Button
              size="compact"
              leadingIcon={<SortIcon size={15} />}
              aria-haspopup="dialog"
              aria-expanded={isOpen}
              onClick={toggle}
            >
              {t('leads.toolbar.sort')}
            </Button>
          )}
        >
          <SortPanel view={view} onChangeView={onChangeView} />
        </Popover>
        <SegmentedControl
          ariaLabel={t('leads.toolbar.viewLabel')}
          value={chosenView}
          onChange={setChosenView}
          options={[
            { value: 'list', label: t('leads.toolbar.list'), icon: <ListViewIcon size={12} /> },
            {
              value: 'split',
              label: t('leads.toolbar.splitView'),
              icon: <SplitViewIcon size={11} />,
              isAvailable: false,
            },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="compact" leadingIcon={<ImportIcon size={15} />} {...notWorkingYet}>
          {t('leads.toolbar.import')}
        </Button>
        <Button size="compact" leadingIcon={<ExportIcon size={15} />} {...notWorkingYet}>
          {t('leads.toolbar.export')}
        </Button>
        <Button variant="primary" size="compact" leadingIcon={<PlusIcon size={16} />} {...notWorkingYet}>
          {t('leads.toolbar.create')}
        </Button>
      </div>
    </div>
  );
}
