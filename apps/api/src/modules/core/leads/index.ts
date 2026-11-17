// The public face of the leads module: the only file other modules may import from it.
// Sign-up uses it to give a new business its starting pipeline.
export { createDefaultPipelineSetup } from './services/default-setup.service';
// The conversation engine gives a new enquiry to the right lead (a new one, the open one, or a recently lost one reopened).
export { applyLeadFromConversation } from './services/lead-from-conversation.service';
export type { ConversationChannelForLead, LeadFromConversationResult } from './services/lead-from-conversation.service';
// The setup wizard gives a business its industry's stage names through the pipeline service.
export { createPipelineService } from './services/pipeline.service';
// A staff correction ("this was not a sale") takes the lead off the board without deleting it.
export { closeLeadAsReclassified } from './services/lead-reclassify.service';
export { DEFAULT_STAGES } from './helpers/default-pipeline';
// The notes module (F07) checks a lead exists, and is the person's to see, before it saves a note on it.
export { findLeadReference, findVisibleLeadIds } from './services/lead-reference.service';
export type { LeadReference } from './services/lead-reference.service';
