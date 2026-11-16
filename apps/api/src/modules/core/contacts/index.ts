// The public face of the contacts module: the only file other modules may import from it.
// The leads module uses it to show who a lead is for, and to keep a contact's lifecycle stage in step with its leads.
export { applyLeadFactsToContact } from './services/contact-lifecycle.service';
export { findContactSummaries } from './services/contact-summaries.service';
export type { ContactSummary } from './services/contact-summaries.service';
// The conversation engine finds or makes the contact for the person on the other end of a conversation.
export {
  findContactIdByIdentity,
  findOrCreateContactFromIdentity,
  lockContactForUpdate,
} from './services/contact-identity.service';
export type { ContactIdentity } from './services/contact-identity.service';
