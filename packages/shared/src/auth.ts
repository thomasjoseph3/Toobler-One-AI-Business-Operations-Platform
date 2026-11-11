import { z } from 'zod';
import { activeModuleSchema } from './modules';

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
    // Whether the person has confirmed their email address (the link we email them)
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

/** `GET /me` and `PATCH /me`: the profile plus the modules that are on for the business, so the app can build its menu. */
export const meResponseSchema = profileResponseSchema.extend({ activeModules: z.array(activeModuleSchema) });
export type MeResponse = z.infer<typeof meResponseSchema>;

/** What the "verify my email" page sends: the token from the link in the email. */
export const verifyEmailRequestSchema = z.object({ token: z.string().trim().min(20).max(200) });
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** What the "forgot password" page sends: the email the account was created with. */
export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/** What the "choose a new password" page sends: the token from the emailed link, and the new password. */
export const resetPasswordRequestSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** What the profile page sends to change the person's own details. Send only what changes; at least one is needed. */
export const updateProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    mobile: z.string().trim().min(5).max(20).optional(),
  })
  .strict() // anything else (email, role, business...) is refused, not silently ignored
  .refine((details) => details.name !== undefined || details.mobile !== undefined, {
    message: 'Send a name, a mobile number, or both.',
  });
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

/** What the "change my password" form sends: the password now in use, and the new one. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** The answer of a route that has nothing to report except that it worked (sign-out, and later more). */
export const okResponseSchema = z.object({ ok: z.literal(true) });
