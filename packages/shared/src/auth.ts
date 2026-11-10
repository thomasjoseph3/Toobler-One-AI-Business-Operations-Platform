import { z } from 'zod';

// The shape of the sign-up request and of the answer. The API checks requests with these; the sign-up form will check
// with the same ones, so the two can never disagree about what is allowed.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** What the sign-up form sends. */
export const signUpRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  businessName: z.string().trim().min(1).max(120),
  // Trimmed and lower-cased before the check, so "Anita@Example.com " and "anita@example.com" are the same person
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  mobile: z.string().trim().min(5).max(20),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  // The id of one of the industries from GET /api/v1/industries. The server checks it is on the list.
  industry: z.string().trim().min(1).max(40),
});
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

/** What the sign-in form sends. The password is not length-checked here: a wrong one is simply "not right". */
export const signInRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

/** The person and their business, as the API answers. Never contains a password or a hash. */
export const profileResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    mobile: z.string().nullable(),
    role: z.enum(['manager', 'staff', 'staff_own']),
  }),
  business: z.object({
    id: z.string(),
    name: z.string(),
    industry: z.string(),
    timeZone: z.string(),
  }),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
