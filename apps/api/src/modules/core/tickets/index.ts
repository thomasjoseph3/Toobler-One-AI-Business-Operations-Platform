// The public face of the tickets module: the only file other modules may import from it.
// The conversation engine gives a request to a ticket (a new one, or the person's open ticket of the same kind as a note).
export { applyTicketFromConversation } from './services/ticket-from-conversation.service';
export type { TicketFromConversationResult } from './services/ticket-from-conversation.service';
