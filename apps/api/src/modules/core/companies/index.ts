// The public face of the companies module: the only file other modules may import from it.
// The activities module (F07) checks a company exists before it shows the company's combined timeline; the agents module saves a company name the AI heard.
export {
  findCompanyNames,
  findCompanyReference,
  findOrCreateCompanyByName,
} from './services/company-reference.service';
export type { CompanyReference } from './services/company-reference.service';
// The search module (F11) finds companies by what staff type in the search box.
export { findCompaniesMatchingText } from './services/company-search.service';
export type { CompanyFound } from './services/company-search.service';
// The exports module (F12) writes the companies a list shows as a CSV file, and looks up the names of the companies contacts belong to.
export { findCompaniesForExport } from './services/company-export.service';
// The duplicates module (F13) finds companies that look like one firm and merges two of them.
export { findCompaniesForDuplicateCheck, findCompaniesByIds, mergeCompanyInto } from './services/company-merge.service';
export type { CompanyRow, MergedCompanyValues } from './services/company-merge.service';
