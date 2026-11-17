import type { ReactNode } from 'react';
import { Button, FilterIcon, Popover } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';

/**
 * The Filter button of a list toolbar, the same on every list (Leads, Contacts, Tickets): a compact button with the filter icon,
 * a number as well as a colour when filters are on, and a panel that opens under it with the filter controls. The words "Filter"
 * and "Filters on: N" are shared; the panel's name says which list it filters.
 */
export function ListFilterPopover(props: { panelLabel: string; activeFilterCount: number; children: ReactNode }) {
  const { panelLabel, activeFilterCount, children } = props;
  return (
    <Popover
      panelLabel={panelLabel}
      renderTrigger={({ isOpen, toggle }) => (
        <Button size="compact" leadingIcon={<FilterIcon size={15} />} aria-haspopup="dialog" aria-expanded={isOpen} onClick={toggle}>
          {t('leads.toolbar.filter')}
          {activeFilterCount > 0 ? (
            <>
              <span aria-hidden className="text-label-xs rounded-full bg-action px-1.5 text-action-text">
                {activeFilterCount}
              </span>
              <span className="sr-only">{formatMessage('leads.activeFilters', { count: activeFilterCount })}</span>
            </>
          ) : null}
        </Button>
      )}
    >
      {children}
    </Popover>
  );
}
