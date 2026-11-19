// The public face of the activities module (timeline and notes).
// The duplicates module (F13) moves a merged-away contact's timeline to the kept contact.
export { moveActivitiesToContact } from './services/contact-merge.service';
// The Today module (F22) uses the first staff touch per lead to decide "not yet contacted" and time-to-first-reply.
export { findFirstTouchTimesForLeads } from './services/lead-touch.service';
