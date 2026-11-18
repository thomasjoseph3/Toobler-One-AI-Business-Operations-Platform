import { z } from 'zod';

// The team of a business between the API and the web app: the people, the invitations waiting to be accepted, and the roles.

export const teamRoleSchema = z.enum(['manager', 'staff', 'staff_own']);
export type TeamRole = z.infer<typeof teamRoleSchema>;

/** What the Invite form sends. The mobile number is optional (it is used for WhatsApp later). */
export const inviteMemberRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Trimmed and lower-cased, so "Priya@Example.com " and "priya@example.com" are the same person
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  mobile: z.string().trim().min(5).max(20).optional(),
  role: teamRoleSchema,
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

/** One person who works in the business. */
export const teamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  mobile: z.string().nullable(),
  role: teamRoleSchema,
  /** `disabled` is a person who was removed: they cannot sign in, and a manager can add them back. */
  status: z.enum(['active', 'disabled']),
  /** When they last signed in (UTC, ISO); null when they never have. */
  lastSignedInAt: z.string().nullable(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

/** An invitation that has not been accepted or cancelled yet. */
export const invitationSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  mobile: z.string().nullable(),
  role: teamRoleSchema,
  invitedAt: z.string(),
  expiresAt: z.string(),
  /** True once the link has run out; the manager can send a new one. */
  isExpired: z.boolean(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** `GET /team`: the people, and the invitations still waiting. */
export const teamResponseSchema = z.object({
  members: z.array(teamMemberSchema),
  invitations: z.array(invitationSchema),
});
export type TeamResponse = z.infer<typeof teamResponseSchema>;

/**
 * `POST /team/invitations`: the new invitation, the link (shown only now, it is stored only as a hash), and whether the email went out.
 * The link lets a manager send the invitation on WhatsApp by hand.
 */
export const invitationCreatedSchema = z.object({
  invitation: invitationSchema,
  link: z.string(),
  emailSent: z.boolean(),
});
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;
