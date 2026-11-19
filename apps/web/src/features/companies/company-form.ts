// The rules of the Add company form: checking what was typed and turning it into what the API takes.
// Pure functions (no screen, no network), so each rule can be tested alone.
import {
  isFreeMailDomain,
  normaliseDomain,
  type Company,
  type CreateCompanyRequest,
  type UpdateCompanyRequest,
} from '@toobler-one/shared';
import type { MessageKey } from '../../app/i18n';

/** Everything typed in the company form, as the text boxes hold it. */
export interface CompanyFormFields {
  name: string;
  /** The firm's website or email domain, typed any way ("https://www.infosys.com/"). */
  domain: string;
  phone: string;
  city: string;
}

export const EMPTY_COMPANY_FORM: CompanyFormFields = { name: '', domain: '', phone: '', city: '' };

/** What is wrong with the form, as the key of the words to show under the box. A box that is fine has no entry. */
export interface CompanyFormProblems {
  name?: MessageKey;
  domain?: MessageKey;
}

/** Checks the form on the device first: a name is needed, and a domain must be a real one and not a free email service. The API checks again. */
export function checkCompanyForm(fields: CompanyFormFields): CompanyFormProblems {
  const problems: CompanyFormProblems = {};
  if (fields.name.trim() === '') problems.name = 'companies.form.problem.name';
  if (fields.domain.trim() !== '') {
    const domain = normaliseDomain(fields.domain);
    if (domain === null) problems.domain = 'companies.form.problem.domain';
    else if (isFreeMailDomain(domain)) problems.domain = 'companies.form.problem.freeMail';
  }
  return problems;
}

/** Turns the typed form into the request body; boxes left empty are left out. */
export function buildCreateCompanyRequest(fields: CompanyFormFields): CreateCompanyRequest {
  const request: CreateCompanyRequest = { name: fields.name.trim() };
  if (fields.domain.trim() !== '') request.domain = fields.domain.trim();
  if (fields.phone.trim() !== '') request.phone = fields.phone.trim();
  if (fields.city.trim() !== '') request.city = fields.city.trim();
  return request;
}

/** The form filled in with an existing company, for changing it (the phone is shown as stored, like +919847012345). */
export function buildCompanyFormFromCompany(
  company: Pick<Company, 'name' | 'domain' | 'phone' | 'city'>,
): CompanyFormFields {
  return { name: company.name, domain: company.domain ?? '', phone: company.phone ?? '', city: company.city ?? '' };
}

/**
 * Turns the edited form into the request body for `PATCH /companies/{id}`: only the boxes that differ from the company are sent, and a box
 * emptied by the person becomes `null` (clear it). An empty object means nothing changed. A domain is compared as the clean domain, so
 * retyping "https://www.infosys.com/" over "infosys.com" is not a change.
 */
export function buildUpdateCompanyRequest(
  fields: CompanyFormFields,
  company: Pick<Company, 'name' | 'domain' | 'phone' | 'city'>,
): UpdateCompanyRequest {
  const request: UpdateCompanyRequest = {};
  if (fields.name.trim() !== company.name) request.name = fields.name.trim();
  const typedDomain = fields.domain.trim() === '' ? null : (normaliseDomain(fields.domain) ?? fields.domain.trim());
  if (typedDomain !== company.domain) request.domain = typedDomain;
  const typedPhone = fields.phone.trim() === '' ? null : fields.phone.trim();
  if (typedPhone !== company.phone) request.phone = typedPhone;
  const typedCity = fields.city.trim() === '' ? null : fields.city.trim();
  if (typedCity !== company.city) request.city = typedCity;
  return request;
}
