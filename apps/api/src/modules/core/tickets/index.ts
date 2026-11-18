// The public face of the tickets module: the only file other modules may import from it.
// The conversation engine gives a request to a ticket (a new one, or the person's open ticket of the same kind as a note).
export { applyTicketFromConversation } from './services/ticket-from-conversation.service';
export type { TicketFromConversationResult } from './services/ticket-from-conversation.service';
// A staff correction ("this was not a service request") closes the ticket with a note, without deleting it.
export { closeTicketAsReclassified } from './services/ticket-reclassify.service';
// The duplicates module (F13) moves a merged-away contact's tickets to the kept contact.
export { moveTicketsToContact } from './services/contact-merge.service';
