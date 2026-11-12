// The public face of the offerings module: the only file other modules may import from it.
// The business profile (knowledge) asks how many offerings are on, to know whether "What do you sell?" is answered.
export { countActiveOfferingsOfBusiness } from './services/offering-counts.service';
