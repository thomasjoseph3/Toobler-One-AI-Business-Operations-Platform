import type { Ticket } from '@toobler-one/shared';
import {
  Card,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tag,
} from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { findLeadDisplayName, findOwnerLabel, formatMoment } from '../leads/lead-display';
import { TicketNameLink } from './TicketNameLink';
import { findPriorityLabelKey, findPriorityTagTone, findTypeLabelKey } from './tickets-view';

export interface TicketsTableProps {
  tickets: readonly Ticket[];
  signedInUserId: string;
  /** The business's time zone, for the dates. */
  timeZone: string;
  selectedTicketIds: ReadonlySet<string>;
  onToggleTicket: (ticketId: string) => void;
  onToggleAllTickets: () => void;
}

/** The priority as a tag: the word always shows, the colour is only a hint. */
function PriorityTag({ ticket }: { ticket: Ticket }) {
  return <Tag tone={findPriorityTagTone(ticket.priority)}>{t(findPriorityLabelKey(ticket.priority))}</Tag>;
}

/** The status as a tag: Open or Closed, in words. */
function StatusTag({ ticket }: { ticket: Ticket }) {
  return (
    <Tag tone={ticket.status === 'open' ? 'new' : 'won'}>
      {ticket.status === 'open' ? t('tickets.status.open') : t('tickets.status.done')}
    </Tag>
  );
}

/** The tickets as a table for tablets and desktops, laid out like the leads table: select box, title, person, type, priority, status, owner and opened. */
export function TicketsTable({
  tickets,
  signedInUserId,
  timeZone,
  selectedTicketIds,
  onToggleTicket,
  onToggleAllTickets,
}: TicketsTableProps) {
  const areAllSelected = tickets.length > 0 && tickets.every((ticket) => selectedTicketIds.has(ticket.id));
  return (
    <Table className="min-w-[900px]" containerClassName="min-h-0 flex-1 overflow-auto">
      <TableHead>
        <tr>
          <TableHeaderCell className="w-12">
            <Checkbox
              label={t('tickets.selectAll')}
              isLabelHidden
              checked={areAllSelected}
              onChange={onToggleAllTickets}
            />
          </TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.title')}</TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.person')}</TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.type')}</TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.priority')}</TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.status')}</TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.owner')}</TableHeaderCell>
          <TableHeaderCell>{t('tickets.column.opened')}</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id} isSelected={selectedTicketIds.has(ticket.id)}>
            <TableCell className="w-12">
              <div className="flex items-center">
                <Checkbox
                  label={formatMessage('tickets.selectOne', { title: ticket.title })}
                  isLabelHidden
                  checked={selectedTicketIds.has(ticket.id)}
                  onChange={() => onToggleTicket(ticket.id)}
                />
              </div>
            </TableCell>
            <TableCell className="max-w-[260px] break-words text-text-primary">
              <TicketNameLink ticketId={ticket.id}>{ticket.title}</TicketNameLink>
            </TableCell>
            <TableCell>{findLeadDisplayName(ticket.contact)}</TableCell>
            <TableCell>{t(findTypeLabelKey(ticket.type))}</TableCell>
            <TableCell>
              <PriorityTag ticket={ticket} />
            </TableCell>
            <TableCell>
              <StatusTag ticket={ticket} />
            </TableCell>
            <TableCell>{findOwnerLabel(ticket.ownerUserId, signedInUserId)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoment(ticket.createdAt, timeZone)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The tickets as a list of cards for a phone, where a wide table would not fit: the same facts, stacked, like the lead cards. */
export function TicketCards({ tickets, signedInUserId }: Pick<TicketsTableProps, 'tickets' | 'signedInUserId'>) {
  return (
    <ul className="flex flex-col gap-3">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <Card isCompact className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <p className="text-body-md-semibold min-w-0 break-words text-text-primary">
                <TicketNameLink ticketId={ticket.id}>{ticket.title}</TicketNameLink>
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <PriorityTag ticket={ticket} />
                <StatusTag ticket={ticket} />
              </div>
            </div>
            <p className="text-body-sm text-text-secondary">{findLeadDisplayName(ticket.contact)}</p>
            <p className="text-body-xs text-text-secondary">
              {t(findTypeLabelKey(ticket.type))} · {findOwnerLabel(ticket.ownerUserId, signedInUserId)}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
