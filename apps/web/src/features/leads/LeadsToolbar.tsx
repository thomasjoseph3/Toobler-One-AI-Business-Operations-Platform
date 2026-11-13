import { useState } from 'react';
import {
  Button,
  ExportIcon,
  FilterIcon,
  ImportIcon,
  ListViewIcon,
  PlusIcon,
  SegmentedControl,
  SortIcon,
  SplitViewIcon,
} from '@toobler-one/ui';
import { t } from '../../app/i18n';

/** What a control that is drawn as designed but does not work yet does when pressed: nothing. */
const doNothingYet = () => undefined;

/** The props that mark a button as "drawn, not working yet": screen readers hear it is unavailable, and the tooltip says so. */
const notWorkingYet = { 'aria-disabled': true, title: t('leads.notYet'), onClick: doNothingYet } as const;

/**
 * The row of controls above the leads (Figma toolbar): Filter, Sort and the List / Split view switch on the left; Import,
 * Export and Create lead on the right. They are drawn exactly as designed and do nothing yet: filtering, sorting and creating
 * a lead have their API but their screens come in the next slices, and Import and Export wait for F12.
 */
export function LeadsToolbar() {
  const [view, setView] = useState<'list' | 'split'>('list');
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="compact" leadingIcon={<FilterIcon size={15} />} {...notWorkingYet}>
          {t('leads.toolbar.filter')}
        </Button>
        <Button size="compact" leadingIcon={<SortIcon size={15} />} {...notWorkingYet}>
          {t('leads.toolbar.sort')}
        </Button>
        <SegmentedControl
          ariaLabel={t('leads.toolbar.viewLabel')}
          value={view}
          onChange={setView}
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
