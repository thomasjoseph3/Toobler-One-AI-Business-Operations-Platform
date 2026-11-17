import type { Contact } from '@toobler-one/shared';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Tag } from '@toobler-one/ui';
import { t } from '../../app/i18n';
import { findLeadDisplayName } from '../leads/lead-display';
import { ContactNameLink } from './ContactNameLink';
import { describeContactDetails, findLifecycleLabelKey, findLifecycleTagTone } from './contacts-view';

/** The contact's stage as a tag: the word always shows, the colour is only a hint. */
function StageTag({ contact }: { contact: Contact }) {
  return <Tag tone={findLifecycleTagTone(contact.lifecycleStage)}>{t(findLifecycleLabelKey(contact.lifecycleStage))}</Tag>;
}

/** The contacts as a table for tablets and desktops (name, phone, email, stage) and as cards on a phone. */
export function ContactsList({ contacts }: { contacts: readonly Contact[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table className="min-w-[640px]" containerClassName="min-h-0 flex-1 overflow-auto">
          <TableHead>
            <tr>
              <TableHeaderCell>{t('contacts.column.name')}</TableHeaderCell>
              <TableHeaderCell>{t('contacts.column.phone')}</TableHeaderCell>
              <TableHeaderCell>{t('contacts.column.email')}</TableHeaderCell>
              <TableHeaderCell>{t('contacts.column.stage')}</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="text-body-md-semibold text-text-primary">
                  <ContactNameLink contactId={contact.id}>{findLeadDisplayName(contact)}</ContactNameLink>
                </TableCell>
                <TableCell>{contact.phone ?? t('contacts.none')}</TableCell>
                <TableCell>{contact.email ?? t('contacts.none')}</TableCell>
                <TableCell>
                  <StageTag contact={contact} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col md:hidden">
        {contacts.map((contact) => (
          <li key={contact.id} className="flex flex-col gap-1 border-t border-border-subtle p-4 first:border-t-0">
            <ContactNameLink contactId={contact.id} className="text-body-md-semibold text-text-primary">
              {findLeadDisplayName(contact)}
            </ContactNameLink>
            <span className="text-body-sm text-text-secondary">{describeContactDetails(contact)}</span>
            <span>
              <StageTag contact={contact} />
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
