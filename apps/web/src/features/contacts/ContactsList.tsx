import type { ReactNode } from 'react';
import type { Contact } from '@toobler-one/shared';
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
import { findLeadDisplayName } from '../leads/lead-display';
import { ContactNameLink } from './ContactNameLink';
import { findLifecycleLabelKey, findLifecycleTagTone } from './contacts-view';

export interface ContactsTableProps {
  contacts: readonly Contact[];
  selectedContactIds: ReadonlySet<string>;
  onToggleContact: (contactId: string) => void;
  onToggleAllContacts: () => void;
  /** Draws the "…" menu of one contact (the page knows what each action does). */
  renderRowMenu: (contact: Contact, displayName: string) => ReactNode;
}

/** The contact's stage as a tag: the word always shows, the colour is only a hint. */
function StageTag({ contact }: { contact: Contact }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Tag tone={findLifecycleTagTone(contact.lifecycleStage)}>{t(findLifecycleLabelKey(contact.lifecycleStage))}</Tag>
      {/* A contact an import made is marked in words (never colour alone) */}
      {contact.importedAt !== null ? <Tag tone="neutral">{t('contacts.imported')}</Tag> : null}
    </span>
  );
}

/** The contacts as a table for tablets and desktops, laid out like the leads table: select box, name, email, phone, stage and the "…" menu. */
export function ContactsTable({
  contacts,
  selectedContactIds,
  onToggleContact,
  onToggleAllContacts,
  renderRowMenu,
}: ContactsTableProps) {
  const areAllSelected = contacts.length > 0 && contacts.every((contact) => selectedContactIds.has(contact.id));
  return (
    <Table className="min-w-[720px]" containerClassName="min-h-0 flex-1 overflow-auto">
      <TableHead>
        <tr>
          <TableHeaderCell className="w-12">
            <Checkbox
              label={t('contacts.selectAll')}
              isLabelHidden
              checked={areAllSelected}
              onChange={onToggleAllContacts}
            />
          </TableHeaderCell>
          <TableHeaderCell>{t('contacts.column.name')}</TableHeaderCell>
          <TableHeaderCell>{t('contacts.column.email')}</TableHeaderCell>
          <TableHeaderCell>{t('contacts.column.phone')}</TableHeaderCell>
          <TableHeaderCell>{t('contacts.column.stage')}</TableHeaderCell>
          <TableHeaderCell className="w-12">
            <span className="sr-only">{t('contacts.column.actions')}</span>
          </TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {contacts.map((contact) => {
          const displayName = findLeadDisplayName(contact);
          return (
            <TableRow key={contact.id} isSelected={selectedContactIds.has(contact.id)}>
              <TableCell className="w-12">
                <div className="flex items-center">
                  <Checkbox
                    label={formatMessage('contacts.selectOne', { name: displayName })}
                    isLabelHidden
                    checked={selectedContactIds.has(contact.id)}
                    onChange={() => onToggleContact(contact.id)}
                  />
                </div>
              </TableCell>
              <TableCell className="text-text-primary">
                <ContactNameLink contactId={contact.id}>{displayName}</ContactNameLink>
              </TableCell>
              <TableCell>{contact.email}</TableCell>
              <TableCell className="whitespace-nowrap">{contact.phone}</TableCell>
              <TableCell>
                <StageTag contact={contact} />
              </TableCell>
              <TableCell className="w-12">{renderRowMenu(contact, displayName)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** The contacts as a list of cards for a phone, where a wide table would not fit: the same facts, stacked, like the lead cards. */
export function ContactCards({ contacts, renderRowMenu }: Pick<ContactsTableProps, 'contacts' | 'renderRowMenu'>) {
  return (
    <ul className="flex flex-col gap-3">
      {contacts.map((contact) => {
        const displayName = findLeadDisplayName(contact);
        return (
          <li key={contact.id}>
            <Card isCompact className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-body-md-semibold min-w-0 text-text-primary">
                  <ContactNameLink contactId={contact.id}>{displayName}</ContactNameLink>
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <StageTag contact={contact} />
                  {renderRowMenu(contact, displayName)}
                </div>
              </div>
              {contact.phone ? <p className="text-body-sm text-text-secondary">{contact.phone}</p> : null}
              {contact.email ? <p className="text-body-sm text-text-secondary">{contact.email}</p> : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
