import { z } from 'zod';

// The shape of the industry list the API answers with. The list itself lives in the database (the `industries` table) and
// comes from GET /api/v1/industries, so nothing about which industries exist is written into the web app.

export const industrySchema = z.object({ id: z.string(), label: z.string() });
export type Industry = z.infer<typeof industrySchema>;

export const industriesResponseSchema = z.object({ items: z.array(industrySchema) });
export type IndustriesResponse = z.infer<typeof industriesResponseSchema>;

/**
 * What a platform admin sends to add an industry. The id is a short lower-case name like `salon` or `real_estate`
 * (letters, digits and underscores, starting with a letter). `sortOrder` decides where it appears in the list: the
 * seeded ones use 10 to 70 and "Something else" uses 999, so the default of 100 puts a new one just before that.
 */
export const createIndustryRequestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,39}$/, 'Use 2 to 40 lower-case letters, digits or underscores, starting with a letter'),
  label: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(1).max(998).optional(),
});
export type CreateIndustryRequest = z.infer<typeof createIndustryRequestSchema>;
