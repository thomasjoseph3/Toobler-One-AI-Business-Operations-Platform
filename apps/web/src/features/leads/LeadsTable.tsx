import type { Lead } from '@toobler-one/shared';
import {
  ActivityIcon,
  AddNoteIcon,
  CalendarIcon,
  Card,
  Checkbox,
  IconButton,
  ManageColumnsIcon,
  MoreIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tag,
} from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import {
  findChannelLabel,
  findLeadDisplayName,
  findOwnerLabel,
  findStageTagTone,
  formatCallbackDate,
} from './lead-display';

export interface LeadsTableProps {
  leads: readonly Lead[];
  openStageIdsInOrder: readonly string[];
  signedInUserId: string;
  /** The business's time zone, for the callback dates. */
  timeZone: string;
  selectedLeadIds: ReadonlySet<string>;
  onToggleLead: (leadId: string) => void;
  onToggleAllLeads: () => void;
}

/** The small green chip with the callback date (Figma "Next activity"); the calendar icon and the date both show. */
function CallbackChip({ date }: { date: string }) {
  return (
    <span className="text-label-xs inline-flex items-center gap-1 rounded-sm bg-success-bg px-2 py-1 text-success">
      <CalendarIcon size={14} />
      {date}
    </span>
  );
}

/** The leads as a table for tablets and desktops (Figma "Leads list"): select box, name, email, phone, status, source, owner and next activity. */
export function LeadsTable({
  leads,
  openStageIdsInOrder,
  signedInUserId,
  timeZone,
  selectedLeadIds,
  onToggleLead,
  onToggleAllLeads,
}: LeadsTableProps) {
  const areAllSelected = leads.length > 0 && leads.every((lead) => selectedLeadIds.has(lead.id));
  return (
    <Table className="min-w-[940px]">
      <TableHead>
        <tr>
          <TableHeaderCell className="w-12">
            <Checkbox label={t('leads.selectAll')} isLabelHidden checked={areAllSelected} onChange={onToggleAllLeads} />
          </TableHeaderCell>
          <TableHeaderCell>{t('leads.column.name')}</TableHeaderCell>
          <TableHeaderCell>{t('leads.column.email')}</TableHeaderCell>
          <TableHeaderCell>{t('leads.column.phone')}</TableHeaderCell>
          <TableHeaderCell>{t('leads.column.status')}</TableHeaderCell>
          <TableHeaderCell>{t('leads.column.source')}</TableHeaderCell>
          <TableHeaderCell>{t('leads.column.owner')}</TableHeaderCell>
          <TableHeaderCell>{t('leads.column.nextActivity')}</TableHeaderCell>
          <TableHeaderCell className="w-12">
            {/* Choosing columns is drawn as designed and does nothing yet */}
            <IconButton
              label={t('leads.chooseColumns')}
              size="compact"
              icon={<ManageColumnsIcon size={16} />}
              aria-disabled
              title={t('leads.notYet')}
            />
          </TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {leads.map((lead) => {
          const displayName = findLeadDisplayName(lead.contact);
          const callbackDate = formatCallbackDate(lead.callbackAt, timeZone);
          return (
            <TableRow key={lead.id} isSelected={selectedLeadIds.has(lead.id)}>
              <TableCell className="w-12">
                <div className="flex items-center">
                  <Checkbox
                    label={formatMessage('leads.selectOne', { name: displayName })}
                    isLabelHidden
                    checked={selectedLeadIds.has(lead.id)}
                    onChange={() => onToggleLead(lead.id)}
                  />
                </div>
              </TableCell>
              <TableCell className="text-text-primary">{displayName}</TableCell>
              <TableCell>{lead.contact?.email}</TableCell>
              <TableCell className="whitespace-nowrap">{lead.contact?.phone}</TableCell>
              <TableCell>
                <Tag tone={findStageTagTone(lead.stage, openStageIdsInOrder)}>{lead.stage.name}</Tag>
              </TableCell>
              <TableCell>{findChannelLabel(lead.firstChannel)}</TableCell>
              <TableCell>{findOwnerLabel(lead.ownerUserId, signedInUserId)}</TableCell>
              <TableCell>
                {callbackDate ? (
                  <CallbackChip date={callbackDate} />
                ) : (
                  // With no callback booked, the quick actions show when the row is hovered or focused (as in the Figma row)
                  <div className="invisible flex items-center gap-1 group-focus-within:visible group-hover:visible">
                    <IconButton
                      label={t('leads.row.logActivity')}
                      size="compact"
                      icon={<ActivityIcon size={20} />}
                      aria-disabled
                      title={t('leads.notYet')}
                    />
                    <IconButton
                      label={t('leads.row.addNote')}
                      size="compact"
                      icon={<AddNoteIcon size={18} />}
                      aria-disabled
                      title={t('leads.notYet')}
                    />
                  </div>
                )}
              </TableCell>
              <TableCell className="w-12">
                <IconButton
                  label={formatMessage('leads.row.more', { name: displayName })}
                  size="compact"
                  icon={<MoreIcon size={20} />}
                  aria-disabled
                  title={t('leads.notYet')}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The leads as a list of cards for a phone, where a wide table would not fit: the same facts, stacked. */
export function LeadCards({
  leads,
  openStageIdsInOrder,
  signedInUserId,
  timeZone,
}: Pick<LeadsTableProps, 'leads' | 'openStageIdsInOrder' | 'signedInUserId' | 'timeZone'>) {
  return (
    <ul className="flex flex-col gap-3">
      {leads.map((lead) => {
        const callbackDate = formatCallbackDate(lead.callbackAt, timeZone);
        return (
          <li key={lead.id}>
            <Card isCompact className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-body-md-semibold min-w-0 text-text-primary">{findLeadDisplayName(lead.contact)}</p>
                <Tag tone={findStageTagTone(lead.stage, openStageIdsInOrder)}>{lead.stage.name}</Tag>
              </div>
              {lead.contact?.phone ? <p className="text-body-sm text-text-secondary">{lead.contact.phone}</p> : null}
              {lead.contact?.email ? <p className="text-body-sm text-text-secondary">{lead.contact.email}</p> : null}
              <p className="text-body-xs text-text-secondary">
                {findChannelLabel(lead.firstChannel)} · {findOwnerLabel(lead.ownerUserId, signedInUserId)}
              </p>
              {callbackDate ? (
                <div>
                  <CallbackChip date={callbackDate} />
                </div>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
