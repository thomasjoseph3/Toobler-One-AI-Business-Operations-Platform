import { z } from 'zod';
import { customValuesInputSchema, customValuesSchema } from './custom-fields';

// Companies between the API and the web app: a firm, school, family or group that contacts belong to ("Infosys HR").

/**
 * Email domains anyone can have (free mail). They say nothing about a firm, so they can never be a company's domain and never suggest one.
 * One list for the API and the web app, so the two always agree.
 */
export const FREE_MAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.in',
  'yahoo.co.in',
  'yahoo.co.uk',
  'ymail.com',
  'outlook.com',
  'outlook.in',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.in',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'rediffmail.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'zoho.com',
];

/** Whether this domain is a free-mail one ("gmail.com"). */
export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.includes(domain.toLowerCase());
}

/** The domain part of an email address ("anita@Infosys.com" gives "infosys.com"), or null when it is not an address. */
export function readEmailDomain(email: string): string | null {
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2 || parts[0] === '' || !parts[1]?.includes('.')) return null;
  return parts[1];
}

/**
 * Turns what a person typed or pasted ("https://www.Infosys.com/careers", "infosys.com:8080") into a bare domain ("infosys.com"), or null when
 * it cannot be a domain.
 */
export function normaliseDomain(typedDomain: string): string | null {
  const bare = typedDomain
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//u, '')
    .replace(/^www\./u, '')
    .split(/[/?#:]/u)[0];
  if (!bare || bare.length > 253) return null;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u.test(bare) ? bare : null;
}

/** An empty or blank text means "nothing was given", so a form that sends "" for an untouched field works. */
const blankToNothing = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** A typed domain, cleaned to a bare domain; text that cannot be a domain is refused with a plain message. */
const domainField = z
  .string()
  .trim()
  .max(300)
  .transform((text, context) => {
    const domain = normaliseDomain(text);
    if (domain === null) {
      context.addIssue({ code: 'custom', message: 'Enter a website address like infosys.com.' });
      return z.NEVER;
    }
    return domain;
  });

/** The longest company name the API accepts. */
export const MAX_COMPANY_NAME_LENGTH = 120;

export const companySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The work domain of its people's email addresses, like infosys.com. */
  domain: z.string().nullable(),
  /** International form, like +919847012345. */
  phone: z.string().nullable(),
  city: z.string().nullable(),
  /** Who looks after the company; name is null when the person was removed. */
  owner: z.object({ userId: z.string(), name: z.string().nullable() }).nullable(),
  /** How many contacts belong to it. Worked out by the API. */
  contactCount: z.number().int(),
  /** Open leads of its contacts. Worked out by the API. */
  openLeads: z.number().int(),
  /** The combined budget of its contacts' won leads, in paise. Worked out by the API. */
  wonValuePaise: z.number().int(),
  /** The answers to the business's custom company fields (F09), by field key; only live fields. */
  custom: customValuesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Company = z.infer<typeof companySchema>;

/**
 * What staff send to add a company. A name is needed; the rest is optional. The domain may be typed any way (it is cleaned to "infosys.com") and
 * must not be a free-mail domain (checked by the API). The phone may be typed in any format. Without an owner the person adding it looks after it.
 */
export const createCompanyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_COMPANY_NAME_LENGTH),
    domain: z.preprocess(blankToNothing, domainField.optional()),
    phone: z.preprocess(blankToNothing, z.string().trim().max(40).optional()),
    city: z.preprocess(blankToNothing, z.string().trim().max(80).optional()),
    ownerUserId: z.uuid().optional(),
    custom: customValuesInputSchema.optional(),
  })
  .strict();
export type CreateCompanyRequest = z.infer<typeof createCompanyRequestSchema>;

/** The list: a search box, an exact domain (for the contact page's suggestion), and paging. */
export const listCompaniesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  domain: z.preprocess(blankToNothing, domainField.optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;

export const companiesListResponseSchema = z.object({
  items: z.array(companySchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type CompaniesListResponse = z.infer<typeof companiesListResponseSchema>;

/** The address part naming a company. */
export const companyIdParamsSchema = z.object({ id: z.uuid() });

/** A person of the company, as its page lists them. */
export const companyContactSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  lifecycleStage: z.enum(['new', 'lead', 'customer', 'repeat_customer', 'not_a_fit']),
});
export type CompanyContact = z.infer<typeof companyContactSchema>;

/** A lead of one of the company's people, as its page lists it. */
export const companyLeadSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  /** The word for the stage in this business's pipeline. */
  stageName: z.string(),
  stageKind: z.enum(['open', 'won', 'lost']),
  interest: z.string().nullable(),
  budgetPaise: z.number().int().nullable(),
  createdAt: z.string(),
});
export type CompanyLead = z.infer<typeof companyLeadSchema>;

/** `GET /companies/{id}`: the company with its numbers, its people and their leads. The "own leads only" role sees only the leads it owns. */
export const companyDetailSchema = companySchema.extend({
  contacts: z.array(companyContactSchema),
  leads: z.array(companyLeadSchema),
});
export type CompanyDetail = z.infer<typeof companyDetailSchema>;

/** The address part naming a contact, for `PUT /contacts/{id}/company`. */
export const linkContactParamsSchema = z.object({ id: z.uuid() });

/** `PUT /contacts/{id}/company`: the company the contact now belongs to, or `null` to take the contact out of its company. */
export const setContactCompanyRequestSchema = z.object({ companyId: z.uuid().nullable() }).strict();
export type SetContactCompanyRequest = z.infer<typeof setContactCompanyRequestSchema>;

/** For an edit: a blank text, like an emptied form field, means "clear it". Leaving the key out means "leave it as it is". */
const clearIfBlank = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

/**
 * What staff send to change a company. Only the fields sent change; `null` (or blank text) clears the domain, phone and city, and `ownerUserId`
 * `null` leaves the company with nobody. The name cannot be emptied. At least one field is needed. Any other field is refused.
 */
export const updateCompanyRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_COMPANY_NAME_LENGTH).optional(),
    domain: z.preprocess(clearIfBlank, domainField.nullable().optional()),
    phone: z.preprocess(clearIfBlank, z.string().trim().max(40).nullable().optional()),
    city: z.preprocess(clearIfBlank, z.string().trim().max(80).nullable().optional()),
    ownerUserId: z.uuid().nullable().optional(),
    /** Answers to custom fields; only the keys sent change (null removes one). */
    custom: customValuesInputSchema.optional(),
  })
  .strict()
  .refine((request) => Object.values(request).some((value) => value !== undefined), {
    message: 'Send at least one field to change.',
  });
export type UpdateCompanyRequest = z.infer<typeof updateCompanyRequestSchema>;
