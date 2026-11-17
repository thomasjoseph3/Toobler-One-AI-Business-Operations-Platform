import { Button, PlusIcon, SelectField } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { ListFilterPopover } from '../shared/ListFilterPopover';
import { countActiveTicketFilters, TICKET_PRIORITY_CHOICES, TICKET_TYPE_CHOICES, type TicketsView } from './tickets-view';

export interface TicketsToolbarProps {
  view: TicketsView;
  /** Changes part of the view. Any change other than the page starts again at page 1. */
  onChangeView: (changes: Partial<TicketsView>) => void;
  onClearFilters: () => void;
  /** Opens the Add ticket form. */
  onAddTicket: () => void;
}

/**
 * The row of controls above the tickets, laid out like the Leads toolbar: Filter on the left, Add ticket on the right, both
 * compact. The Filter panel holds status, owner, type and priority and a Clear filters button.
 */
export function TicketsToolbar({ view, onChangeView, onClearFilters, onAddTicket }: TicketsToolbarProps) {
  const activeFilterCount = countActiveTicketFilters(view);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ListFilterPopover panelLabel={t('tickets.filter.title')} activeFilterCount={activeFilterCount}>
          <SelectField
            label={t('tickets.filter.status')}
            value={view.status}
            onChange={(event) => onChangeView({ status: event.target.value === 'all' ? 'all' : event.target.value === 'done' ? 'done' : 'open' })}
            options={[
              { value: 'open', label: t('tickets.status.open') },
              { value: 'done', label: t('tickets.status.done') },
              { value: 'all', label: t('tickets.filter.all') },
            ]}
          />
          <SelectField
            label={t('tickets.filter.owner')}
            value={view.owner}
            onChange={(event) => onChangeView({ owner: event.target.value === 'me' || event.target.value === 'unassigned' ? event.target.value : 'all' })}
            options={[
              { value: 'all', label: t('tickets.filter.everyone') },
              { value: 'me', label: t('tickets.filter.mine') },
              { value: 'unassigned', label: t('tickets.filter.unassigned') },
            ]}
          />
          <SelectField
            label={t('tickets.filter.type')}
            value={view.type}
            onChange={(event) => onChangeView({ type: TICKET_TYPE_CHOICES.find((choice) => choice.type === event.target.value)?.type ?? 'all' })}
            options={[{ value: 'all', label: t('tickets.filter.all') }, ...TICKET_TYPE_CHOICES.map((choice) => ({ value: choice.type, label: t(choice.labelKey) }))]}
          />
          <SelectField
            label={t('tickets.filter.priority')}
            value={view.priority}
            onChange={(event) => onChangeView({ priority: TICKET_PRIORITY_CHOICES.find((choice) => choice.priority === event.target.value)?.priority ?? 'all' })}
            options={[{ value: 'all', label: t('tickets.filter.all') }, ...TICKET_PRIORITY_CHOICES.map((choice) => ({ value: choice.priority, label: t(choice.labelKey) }))]}
          />
          <Button variant="tertiary" size="compact" disabled={activeFilterCount === 0} onClick={onClearFilters}>
            {t('leads.filter.clear')}
          </Button>
        </ListFilterPopover>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="compact" leadingIcon={<PlusIcon size={16} />} onClick={onAddTicket}>
          {t('tickets.add')}
        </Button>
      </div>
    </div>
  );
}
