import type { Ticket } from '@toobler-one/shared';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Tag } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { findLeadDisplayName, findOwnerLabel, formatMoment } from '../leads/lead-display';
import { findPriorityLabelKey, findPriorityTagTone, findTypeLabelKey } from './tickets-view';

export interface TicketsListProps {
  tickets: readonly Ticket[];
  signedInUserId: string;
  /** The business's time zone, for the dates. */
  timeZone: string;
}

/** The priority as a tag: the word always shows, the colour is only a hint. */
function PriorityTag({ ticket }: { ticket: Ticket }) {
  return <Tag tone={findPriorityTagTone(ticket.priority)}>{t(findPriorityLabelKey(ticket.priority))}</Tag>;
}

/** The status as a tag: Open or Closed, in words. */
function StatusTag({ ticket }: { ticket: Ticket }) {
  return <Tag tone={ticket.status === 'open' ? 'new' : 'won'}>{ticket.status === 'open' ? t('tickets.status.open') : t('tickets.status.done')}</Tag>;
}

/** The tickets as a table for tablets and desktops and as cards on a phone. */
export function TicketsList({ tickets, signedInUserId, timeZone }: TicketsListProps) {
  return (
    <>
      <div className="hidden md:block">
        <Table className="min-w-[860px]" containerClassName="min-h-0 flex-1 overflow-auto">
          <TableHead>
            <tr>
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
              <TableRow key={ticket.id}>
                <TableCell className="text-body-md-semibold max-w-[260px] break-words text-text-primary">{ticket.title}</TableCell>
                <TableCell>{findLeadDisplayName(ticket.contact)}</TableCell>
                <TableCell>{t(findTypeLabelKey(ticket.type))}</TableCell>
                <TableCell>
                  <PriorityTag ticket={ticket} />
                </TableCell>
                <TableCell>
                  <StatusTag ticket={ticket} />
                </TableCell>
                <TableCell>{findOwnerLabel(ticket.ownerUserId, signedInUserId)}</TableCell>
                <TableCell>{formatMoment(ticket.createdAt, timeZone)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col md:hidden">
        {tickets.map((ticket) => (
          <li key={ticket.id} className="flex flex-col gap-1 border-t border-border-subtle p-4 first:border-t-0">
            <span className="text-body-md-semibold break-words text-text-primary">{ticket.title}</span>
            <span className="text-body-sm text-text-secondary">
              {findLeadDisplayName(ticket.contact)} · {t(findTypeLabelKey(ticket.type))}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <PriorityTag ticket={ticket} />
              <StatusTag ticket={ticket} />
              <span className="text-body-xs text-text-secondary">{findOwnerLabel(ticket.ownerUserId, signedInUserId)}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
