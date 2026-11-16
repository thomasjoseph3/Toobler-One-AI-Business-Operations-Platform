// The public face of the sign-in module: the only file other modules may import from here.
// The knowledge module's settings routes use it to change the business's time zone and default country.
export { createBusinessSettingsService } from './services/business-settings.service';
// The conversations module uses these to seed a business's types for its kind of business, and to tell the team's own phone numbers and emails from customers'.
export { findBusinessIdentity, findBusinessIndustry, findStaffContactPoints } from './services/business-facts.service';
export type { BusinessIdentity } from './services/business-facts.service';
// The AI agent (F19) uses `findBusinessIdentity` to say who it speaks for and to read the business's hours in its own time zone.
