import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../api/client';
import { buildCompaniesPath, DEFAULT_COMPANIES_VIEW, readCompaniesView, writeCompaniesView } from './companies-view';
import {
  buildCompanyFormFromCompany,
  buildCreateCompanyRequest,
  buildUpdateCompanyRequest,
  checkCompanyForm,
  EMPTY_COMPANY_FORM,
} from './company-form';
import { describeCompanySaveProblem } from './company-problem';

describe('the Companies list view', () => {
  it('reads the search and page from the address, and falls back to the default', () => {
    expect(readCompaniesView(new URLSearchParams('q=infosys&page=3'))).toEqual({ searchText: 'infosys', page: 3 });
    expect(readCompaniesView(new URLSearchParams('page=-2&q='))).toEqual(DEFAULT_COMPANIES_VIEW);
    expect(readCompaniesView(new URLSearchParams('page=abc'))).toEqual(DEFAULT_COMPANIES_VIEW);
  });

  it('writes only what is not the default, and builds the API address', () => {
    expect(writeCompaniesView(DEFAULT_COMPANIES_VIEW).toString()).toBe('');
    expect(writeCompaniesView({ searchText: ' infosys ', page: 2 }).toString()).toBe('q=infosys&page=2');
    expect(buildCompaniesPath({ searchText: 'infosys hr', page: 2 })).toBe('/companies?q=infosys+hr&page=2&limit=25');
  });
});

describe('the Add company form', () => {
  it('asks for a name', () => {
    expect(checkCompanyForm(EMPTY_COMPANY_FORM)).toEqual({ name: 'companies.form.problem.name' });
    expect(checkCompanyForm({ ...EMPTY_COMPANY_FORM, name: 'Infosys HR' })).toEqual({});
  });

  it('accepts a pasted web address as a domain, and refuses free email services and nonsense', () => {
    const named = { ...EMPTY_COMPANY_FORM, name: 'Infosys HR' };
    expect(checkCompanyForm({ ...named, domain: 'https://www.infosys.com/careers' })).toEqual({});
    expect(checkCompanyForm({ ...named, domain: 'gmail.com' })).toEqual({ domain: 'companies.form.problem.freeMail' });
    expect(checkCompanyForm({ ...named, domain: 'not a domain' })).toEqual({ domain: 'companies.form.problem.domain' });
  });

  it('leaves empty boxes out of the request and trims the rest', () => {
    expect(buildCreateCompanyRequest({ name: ' Infosys HR ', domain: '', phone: '  ', city: ' Pune ' })).toEqual({
      name: 'Infosys HR',
      city: 'Pune',
    });
  });
});

describe('refusals in words', () => {
  it('says a name or domain already used in plain words, and shows the API’s own words for a free-mail domain', () => {
    expect(describeCompanySaveProblem(new ApiRequestError(409, 'COMPANY_EXISTS', 'x'))).toContain(
      'already have a company',
    );
    expect(describeCompanySaveProblem(new ApiRequestError(409, 'COMPANY_DOMAIN_EXISTS', 'x'))).toContain('website');
    expect(
      describeCompanySaveProblem(new ApiRequestError(400, 'FREE_MAIL_DOMAIN', 'This is a free email service.')),
    ).toBe('This is a free email service.');
    expect(describeCompanySaveProblem(new ApiRequestError(500, 'UNKNOWN_ERROR', 'boom'))).toContain(
      'Something went wrong',
    );
  });
});

describe('changing a company', () => {
  const company = { name: 'Infosys HR', domain: 'infosys.com', phone: '+919847012345', city: 'Pune' };

  it('fills the form from the company', () => {
    expect(buildCompanyFormFromCompany(company)).toEqual({
      name: 'Infosys HR',
      domain: 'infosys.com',
      phone: '+919847012345',
      city: 'Pune',
    });
    expect(buildCompanyFormFromCompany({ ...company, domain: null, phone: null, city: null })).toEqual({
      name: 'Infosys HR',
      domain: '',
      phone: '',
      city: '',
    });
  });

  it('sends nothing when nothing changed, even when the domain is retyped as a web address', () => {
    expect(buildUpdateCompanyRequest(buildCompanyFormFromCompany(company), company)).toEqual({});
    expect(
      buildUpdateCompanyRequest(
        { ...buildCompanyFormFromCompany(company), domain: 'https://www.infosys.com/' },
        company,
      ),
    ).toEqual({});
  });

  it('sends only what changed, and null for a box that was emptied', () => {
    expect(
      buildUpdateCompanyRequest(
        { name: ' Infosys Finance ', domain: '', phone: '+919847012345', city: 'Goa' },
        company,
      ),
    ).toEqual({ name: 'Infosys Finance', domain: null, city: 'Goa' });
  });
});
