import { z } from 'zod';
import { INDUSTRY_IDS } from './industries';

// The shape of every sign-in request and answer. The API checks requests with these; the web forms check with the same
// ones, so the two can never disagree about what is allowed. Password strength (the common-password list) is checked
// only by the server.

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const nameSchema = z.string().trim().min(1).max(100);
const tokenSchema = z.string().min(20).max(200);

export const signUpRequestSchema = z.object({
  name: nameSchema,
  businessName: z.string().trim().min(1).max(120),
  email: emailSchema,
  mobile: z.string().trim().min(5).max(20),
  password: passwordSchema,
  industry: z.enum(INDUSTRY_IDS),
});
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

export const signInRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const verifyEmailRequestSchema = z.object({ token: tokenSchema });
export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({ token: tokenSchema, password: passwordSchema });
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export const updateProfileRequestSchema = z.object({ name: nameSchema });

/** The signed-in person and their business, as `/me` and the sign-in routes answer. Never contains a secret. */
export const profileResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    mobile: z.string().nullable(),
    role: z.enum(['manager', 'staff', 'staff_own']),
    emailVerified: z.boolean(),
  }),
  business: z.object({
    id: z.string(),
    name: z.string(),
    industry: z.string(),
    timeZone: z.string(),
  }),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });
