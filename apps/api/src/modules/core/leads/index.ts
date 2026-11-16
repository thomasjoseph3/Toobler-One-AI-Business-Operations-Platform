// The public face of the leads module: the only file other modules may import from it.
// Sign-up uses it to give a new business its starting pipeline.
export { createDefaultPipelineSetup } from './services/default-setup.service';
// The conversation engine gives a new enquiry to the right lead (a new one, the open one, or a recently lost one reopened).
export { applyLeadFromConversation } from './services/lead-from-conversation.service';
export type { ConversationChannelForLead, LeadFromConversationResult } from './services/lead-from-conversation.service';
