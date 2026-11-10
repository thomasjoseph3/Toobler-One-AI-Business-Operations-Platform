// The kinds of business a person can pick at sign-up. Only "general" has presets for now (stages, fields and words
// arrive with F16/F31); the choice is stored so the others can get theirs later without asking again.
export const INDUSTRIES = [
  { id: 'general', label: 'General business' },
  { id: 'hotel_resort', label: 'Hotel or resort' },
  { id: 'real_estate', label: 'Real estate' },
  { id: 'clinic', label: 'Clinic or hospital' },
  { id: 'education', label: 'School, college or coaching' },
  { id: 'services', label: 'Professional or home services' },
  { id: 'retail', label: 'Shop or retail' },
  { id: 'other', label: 'Something else' },
] as const;

export type IndustryId = (typeof INDUSTRIES)[number]['id'];

/** The industry ids as a tuple, for `z.enum`. */
export const INDUSTRY_IDS = INDUSTRIES.map((industry) => industry.id) as [IndustryId, ...IndustryId[]];
