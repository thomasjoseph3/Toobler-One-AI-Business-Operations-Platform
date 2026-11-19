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
  /** The teams they are in. */
  teams: z.array(z.object({ id: z.string(), name: z.string() })),
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

/** What the accept page sends first, to show who invited the person (the token from the emailed link). It is in the body, never in the address, so it is not written to logs. */
export const previewInvitationRequestSchema = z.object({ token: z.string().trim().min(20).max(200) });
export type PreviewInvitationRequest = z.infer<typeof previewInvitationRequestSchema>;

/** What the accept page shows before the person chooses a password. */
export const invitationPreviewSchema = z.object({
  name: z.string(),
  email: z.string(),
  role: teamRoleSchema,
  businessName: z.string(),
  invitedByName: z.string(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** What the accept page sends when the person chooses a password: the token from the link and the password. */
export const acceptInvitationRequestSchema = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(10).max(128),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

/** The id of a person of the business in an address. */
export const teamMemberIdParamsSchema = z.object({ id: z.uuid() });

/**
 * `PATCH /team/members/{id}`: change a person's role, and/or add a removed person back (`status: 'active'`). At least one. Removing a person is
 * `DELETE`, not this.
 */
export const updateTeamMemberRequestSchema = z
  .object({ role: teamRoleSchema, status: z.literal('active') })
  .partial()
  .refine((request) => request.role !== undefined || request.status !== undefined, {
    message: 'Send a role or a status.',
  });
export type UpdateTeamMemberRequest = z.infer<typeof updateTeamMemberRequestSchema>;

/** `DELETE /team/members/{id}?hand_over_to=`: who takes over the removed person's open leads, tasks and tickets (the manager removing them when left out). */
export const removeTeamMemberQuerySchema = z.object({ hand_over_to: z.uuid().optional() });
export type RemoveTeamMemberQuery = z.infer<typeof removeTeamMemberQuerySchema>;

/** The id of an invitation in an address. */
export const invitationIdParamsSchema = z.object({ id: z.uuid() });

/** The longest team name the API accepts. */
export const MAX_TEAM_NAME_LENGTH = 60;

/** A team of the business: its name and who is in it. */
export const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(z.object({ userId: z.string(), name: z.string() })),
});
export type Team = z.infer<typeof teamSchema>;

/** `POST /teams`: a name, and (optionally) the people to put in it. Every person must work in the business. */
export const createTeamRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_TEAM_NAME_LENGTH),
  memberIds: z.array(z.uuid()).max(100).default([]),
});
export type CreateTeamRequest = z.infer<typeof createTeamRequestSchema>;

/** `GET /teams`: every team of the business, by name. */
export const teamsResponseSchema = z.object({ items: z.array(teamSchema) });
export type TeamsResponse = z.infer<typeof teamsResponseSchema>;

/** The id of a team in an address. */
export const teamIdParamsSchema = z.object({ id: z.uuid() });

/** `PATCH /teams/{id}`: a new name and/or the full list of people in the team (the list replaces the old one). At least one. */
export const updateTeamRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TEAM_NAME_LENGTH),
    memberIds: z.array(z.uuid()).max(100),
  })
  .partial()
  .refine((request) => request.name !== undefined || request.memberIds !== undefined, {
    message: 'Send a name or a list of people.',
  });
export type UpdateTeamRequest = z.infer<typeof updateTeamRequestSchema>;
