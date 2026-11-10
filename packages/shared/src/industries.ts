import { z } from 'zod';

// The shape of the industry list the API answers with. The list itself lives in the database (the `industries` table) and
// comes from GET /api/v1/industries, so nothing about which industries exist is written into the web app.

export const industrySchema = z.object({ id: z.string(), label: z.string() });
export type Industry = z.infer<typeof industrySchema>;

export const industriesResponseSchema = z.object({ items: z.array(industrySchema) });
export type IndustriesResponse = z.infer<typeof industriesResponseSchema>;
