import type { Contact } from '@toobler-one/shared';
import { ActionMenu, type ActionMenuItem } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';

/**
 * The "…" menu of one contact, like the one on a lead: Open contact, and, for a manager, Delete. A member of staff never sees
 * Delete (the API would refuse it anyway).
 */
export function ContactRowMenu(props: {
  contact: Contact;
  /** The name shown for the contact, used in the button's name ("More actions for Priya Menon"). */
  displayName: string;
  signedInUserRole: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { displayName, signedInUserRole, onOpen, onDelete } = props;
  const items: ActionMenuItem[] = [{ id: 'open', label: t('contacts.menu.open'), onSelect: onOpen }];
  if (signedInUserRole === 'manager') {
    items.push({ id: 'delete', label: t('contacts.menu.delete'), group: 'delete', tone: 'danger', onSelect: onDelete });
  }
  return (
    <ActionMenu
      triggerLabel={formatMessage('leads.row.more', { name: displayName })}
      panelLabel={formatMessage('leads.menu.panel', { name: displayName })}
      items={items}
    />
  );
}
