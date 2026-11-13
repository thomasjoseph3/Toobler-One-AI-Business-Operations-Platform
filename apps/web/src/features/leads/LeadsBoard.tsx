import type { ReactNode } from 'react';
import type { BoardColumn, Lead } from '@toobler-one/shared';
import { ActivityIcon, CalendarIcon, IconButton, MoreIcon, PhoneIcon, Tag } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import {
  findChannelLabel,
  findLeadDisplayName,
  findOwnerLabel,
  findStageTagTone,
  formatCallbackDate,
} from './lead-display';

export interface LeadsBoardProps {
  /** One column per stage, in pipeline order (from `GET /leads?view=board`). */
  columns: readonly BoardColumn[];
  signedInUserId: string;
  /** The business's time zone, for the callback dates. */
  timeZone: string;
  /** Draws the "…" menu of one lead (move to another stage, take it, delete). */
  renderRowMenu: (lead: Lead, displayName: string) => ReactNode;
}

/** One lead as a card (Figma pipeline card): name and menu, the source and the phone, the owner, and the callback date or the activity shortcut. */
function LeadCard({
  lead,
  signedInUserId,
  timeZone,
  renderRowMenu,
}: { lead: Lead } & Pick<LeadsBoardProps, 'signedInUserId' | 'timeZone' | 'renderRowMenu'>) {
  const displayName = findLeadDisplayName(lead.contact);
  const callbackDate = formatCallbackDate(lead.callbackAt, timeZone);
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-body-md-semibold min-w-0 break-words text-text-primary">{displayName}</p>
        {renderRowMenu(lead, displayName)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label-xs rounded-sm bg-hover px-2 py-1 text-text-secondary">
          {findChannelLabel(lead.firstChannel)}
        </span>
        {lead.contact?.phone ? (
          <span className="text-body-xs flex items-center gap-1.5 text-text-secondary">
            <PhoneIcon size={14} />
            {lead.contact.phone}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <p className="text-body-xs text-text-secondary">
          {t('leads.board.owner')}:{' '}
          <span className="text-body-xs-medium text-text-primary">
            {findOwnerLabel(lead.ownerUserId, signedInUserId)}
          </span>
        </p>
        {callbackDate ? (
          <span className="text-label-xs inline-flex items-center gap-1 rounded-sm bg-success-bg px-2 py-1 text-success">
            <CalendarIcon size={14} />
            {callbackDate}
          </span>
        ) : (
          // Logging an activity needs notes and tasks (F07, F08): drawn as designed, not working yet
          <IconButton
            label={t('leads.row.logActivity')}
            size="compact"
            icon={<ActivityIcon size={18} />}
            aria-disabled
            title={t('leads.notYet')}
          />
        )}
      </div>
    </li>
  );
}

/**
 * The Pipeline view (Figma "Leads Pipeline"): a board with one column per stage, side by side. Each column has the stage's tag
 * with how many leads it holds, and its newest leads as cards (up to 50: if there are more, it says so). The board scrolls
 * sideways when the stages do not fit, and each column scrolls up and down on its own, so the toolbar above stays in view.
 */
export function LeadsBoard({ columns, signedInUserId, timeZone, renderRowMenu }: LeadsBoardProps) {
  const openStageIdsInOrder = columns.filter((column) => column.stage.kind === 'open').map((column) => column.stage.id);
  return (
    <div
      role="list"
      aria-label={t('leads.board.columnsLabel')}
      className="flex min-h-[420px] flex-1 snap-x gap-4 overflow-x-auto pb-2 md:min-h-0"
    >
      {columns.map((column) => (
        <section
          role="listitem"
          key={column.stage.id}
          aria-label={column.stage.name}
          className="flex w-[296px] shrink-0 snap-start flex-col rounded-xl border border-border-subtle bg-surface-subtle p-3"
        >
          <header className="mb-3 flex items-center justify-between gap-2">
            <Tag tone={findStageTagTone(column.stage, openStageIdsInOrder)}>
              {column.stage.name}
              <span aria-hidden className="text-label-xs ml-2 rounded-full bg-surface px-1.5 text-text-primary">
                {column.leadCount}
              </span>
              <span className="sr-only">{formatMessage('leads.board.count', { count: column.leadCount })}</span>
            </Tag>
            {/* Column actions (rename and so on) are drawn as designed and do nothing yet */}
            <IconButton
              label={formatMessage('leads.board.columnMore', { stage: column.stage.name })}
              size="compact"
              icon={<MoreIcon size={20} />}
              aria-disabled
              title={t('leads.notYet')}
            />
          </header>
          {column.leads.length === 0 ? (
            <p className="text-body-sm px-1 text-text-tertiary">{t('leads.board.empty')}</p>
          ) : (
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {column.leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  signedInUserId={signedInUserId}
                  timeZone={timeZone}
                  renderRowMenu={renderRowMenu}
                />
              ))}
            </ul>
          )}
          {column.hasMore ? (
            <p className="text-body-xs mt-3 text-text-secondary">
              {formatMessage('leads.board.hasMore', { shown: column.leads.length, total: column.leadCount })}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
