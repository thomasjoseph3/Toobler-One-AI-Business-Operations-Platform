import { z } from 'zod';

// Search between the API and the web app: the box at the top of every page finds contacts, companies and leads.

/** What staff type. Two characters at least, so the box does not answer to a single letter; the API trims it. */
export const globalSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });
export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;

/** A person found by name, email or phone. */
export const globalSearchContactSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

/** A company found by name, website or city. */
export const globalSearchCompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  city: z.string().nullable(),
});

/** A lead found through the person it is about. */
export const globalSearchLeadSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  stageName: z.string(),
  interest: z.string().nullable(),
});

/** At most 5 of each kind, newest change first. */
export const globalGlobalSearchResponseSchema = z.object({
  contacts: z.array(globalSearchContactSchema),
  companies: z.array(globalSearchCompanySchema),
  leads: z.array(globalSearchLeadSchema),
});
export type GlobalSearchResponse = z.infer<typeof globalGlobalSearchResponseSchema>;

/** The most results of each kind. */
export const GLOBAL_SEARCH_RESULTS_PER_KIND = 5;
