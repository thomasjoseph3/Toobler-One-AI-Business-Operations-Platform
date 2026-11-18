// The public face of the fields module: the only file other modules may import from it.
// The contacts, companies and leads modules read a business's live field definitions to check the custom values they save.
export { findFieldDefinitions } from './services/field-definitions-lookup.service';
