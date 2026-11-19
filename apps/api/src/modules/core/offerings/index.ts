// The public face of the offerings module: the only file other modules may import from it.
// The business profile (knowledge) asks how many offerings are on, to know whether "What do you sell?" is answered; the leads module
// asks which offering a lead is about and who looks after it.
export { countActiveOfferingsOfBusiness } from './services/offering-counts.service';
export { findOfferingForLead, findOfferingSummaries } from './services/offering-summaries.service';
export type { OfferingSummary } from './services/offering-summaries.service';
// The AI agent (F19) reads what it may say about the offerings and offers through this one function.
export { findWhatTheAgentMaySee } from './services/agent-offerings.service';
export type { WhatTheAgentMaySee, OfferingForTheAgent, OfferForTheAgent } from './helpers/what-the-ai-may-see';
// Turns an amount in paise into words like "₹4,000": other modules show prices the same way the offerings do.
export { formatRupees } from './helpers/money-in-words';
