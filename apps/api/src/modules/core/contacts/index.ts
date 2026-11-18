// The public face of the contacts module: the only file other modules may import from it.
// The leads module uses it to show who a lead is for, and to keep a contact's lifecycle stage in step with its leads.
export { applyLeadFactsToContact } from './services/contact-lifecycle.service';
export {
  clearCompanyOfContacts,
  findContactCompanyLinks,
  findContactsOfCompany,
  findContactSummaries,
  setContactCompany,
  setContactCompanyIfNone,
  addCustomAnswersToContactWhereEmpty,
  findContactsMatchingText,
  findContactIdsMatchingView,
  findLiveContactIds,
} from './services/contact-summaries.service';
export type { ContactsViewSelection, ContactSummary } from './services/contact-summaries.service';
// The companies module (F05) counts a company's people and finds their leads, and links and unlinks contacts.
// The conversation engine finds or makes the contact for the person on the other end of a conversation.
export {
  findContactIdByIdentity,
  findOrCreateContactFromIdentity,
  lockContactForUpdate,
} from './services/contact-identity.service';
export type { ContactIdentity } from './services/contact-identity.service';
