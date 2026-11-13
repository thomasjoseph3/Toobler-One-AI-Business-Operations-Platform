// The public face of the offerings module: the only file other modules may import from it.
// The business profile (knowledge) asks how many offerings are on, to know whether "What do you sell?" is answered; the leads module
// asks which offering a lead is about and who looks after it.
export { countActiveOfferingsOfBusiness } from './services/offering-counts.service';
export { findOfferingForLead, findOfferingSummaries } from './services/offering-summaries.service';
export type { OfferingSummary } from './services/offering-summaries.service';
