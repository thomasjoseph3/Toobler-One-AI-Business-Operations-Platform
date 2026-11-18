import type { InviteMemberRequest, TeamRole } from '@toobler-one/shared';
import { ApiRequestError } from '../../api/client';
import { t, type MessageKey } from '../../app/i18n';

// The pure logic of the Team screen: role words, the Invite form's checks, and plain sentences for refusals. No screen code here, so it is tested on its own.

/** The three roles, in the order the Invite form lists them, with their words and a one-line help. */
export const ROLE_CHOICES: ReadonlyArray<{ role: TeamRole; labelKey: MessageKey; helpKey: MessageKey }> = [
  { role: 'staff', labelKey: 'team.role.staff', helpKey: 'team.role.staffHelp' },
  { role: 'staff_own', labelKey: 'team.role.staffOwn', helpKey: 'team.role.staffOwnHelp' },
  { role: 'manager', labelKey: 'team.role.manager', helpKey: 'team.role.managerHelp' },
];

/** The words for a role ("Manager", "Staff", "Staff (own leads only)"). */
export function describeRole(role: TeamRole): string {
  const choice = ROLE_CHOICES.find((candidate) => candidate.role === role);
  return choice ? t(choice.labelKey) : role;
}

/** What the person typed in the Invite form. */
export interface InviteFormFields {
  name: string;
  email: string;
  mobile: string;
  role: TeamRole;
}

/** A fresh, empty Invite form (the safest role, plain staff, is chosen). */
export function buildEmptyInviteForm(): InviteFormFields {
  return { name: '', email: '', mobile: '', role: 'staff' };
}

/** The problems found in the Invite form, by field (each is the key of a message). */
export interface InviteFormProblems {
  name?: MessageKey;
  email?: MessageKey;
  mobile?: MessageKey;
}

/** Checks the Invite form on the device before sending it. An empty object means all is well. The API checks again. */
export function checkInviteForm(fields: InviteFormFields): InviteFormProblems {
  const problems: InviteFormProblems = {};
  if (fields.name.trim().length === 0) problems.name = 'team.invite.problem.name';
  const email = fields.email.trim();
  // The same simple shape check the API starts with: something, an @, something, a dot, something
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) problems.email = 'team.invite.problem.email';
  const mobile = fields.mobile.trim();
  if (mobile.length > 0 && mobile.replace(/\D/gu, '').length < 7) problems.mobile = 'team.invite.problem.mobile';
  return problems;
}

/** Turns the form into the request for `POST /team/invitations` (the mobile number is left out when empty). */
export function buildInviteRequest(fields: InviteFormFields): InviteMemberRequest {
  const mobile = fields.mobile.trim();
  return {
    name: fields.name.trim(),
    email: fields.email.trim(),
    role: fields.role,
    ...(mobile.length > 0 ? { mobile } : {}),
  };
}

/** One plain sentence for a failed team change. A refusal the API wrote in plain words (already invited, already has an account) is shown as it is. */
export function describeTeamProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('team.problem.network');
    if (error.status === 403) return t('settings.managersOnly');
    if (
      (error.status === 400 || error.status === 409 || error.status === 429) &&
      error.message &&
      error.code !== 'UNKNOWN_ERROR'
    )
      return error.message;
  }
  return t('team.problem.generic');
}

/** A date for the Team screen, like "18 Nov 2026" (the person's own computer's time zone). */
export function formatTeamDate(isoMoment: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(isoMoment),
  );
}

/** The shortest password the API accepts (the same number as the sign-up form uses). */
export const MINIMUM_PASSWORD_LENGTH = 10;

/** Checks the password typed on the accept page on the device first; returns the key of a message, or undefined when it is fine. The API checks again (common passwords, the person's own email). */
export function checkAcceptPassword(password: string): MessageKey | undefined {
  if (password.length === 0) return 'accept.problem.passwordMissing';
  if (password.length < MINIMUM_PASSWORD_LENGTH) return 'accept.problem.passwordShort';
  return undefined;
}

/** One plain sentence for a failed accept. The API's own words are shown for a weak password (400) or an account that already exists (409); a link that cannot be used has its own sentence. */
export function describeAcceptProblem(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 0) return t('team.problem.network');
    if (error.code === 'INVALID_TOKEN') return t('accept.invalid.description');
    if (
      (error.status === 400 || error.status === 409 || error.status === 429) &&
      error.message &&
      error.code !== 'UNKNOWN_ERROR'
    )
      return error.message;
  }
  return t('team.problem.generic');
}

/** The roles a person can be changed to: every role except the one they have. */
export function listOtherRoles(currentRole: TeamRole): TeamRole[] {
  return ROLE_CHOICES.map((choice) => choice.role).filter((role) => role !== currentRole);
}

/** The people who can take over a removed person's work: everyone still working in the business except the person being removed. */
export function listHandOverChoices(
  members: ReadonlyArray<{ id: string; name: string; status: 'active' | 'disabled' }>,
  removedMemberId: string,
): Array<{ value: string; label: string }> {
  return members
    .filter((member) => member.status === 'active' && member.id !== removedMemberId)
    .map((member) => ({ value: member.id, label: member.name }));
}

/** What the person typed in the team form: the name and which people are ticked. */
export interface TeamFormFields {
  name: string;
  memberIds: string[];
}

/** A fresh team form: no name, nobody ticked. */
export function buildEmptyTeamForm(): TeamFormFields {
  return { name: '', memberIds: [] };
}

/** Checks the team form on the device first; returns the key of a message for the name, or undefined when it is fine. The API checks again (and refuses a name already used). */
export function checkTeamForm(fields: TeamFormFields): MessageKey | undefined {
  if (fields.name.trim().length === 0) return 'teams.form.problem.name';
  return undefined;
}

/** Ticks or unticks one person in the form, keeping the order they were ticked in. */
export function toggleTeamMember(fields: TeamFormFields, userId: string): TeamFormFields {
  const isTicked = fields.memberIds.includes(userId);
  return {
    ...fields,
    memberIds: isTicked ? fields.memberIds.filter((id) => id !== userId) : [...fields.memberIds, userId],
  };
}

/** The words under a team's name: who is in it ("Rahul Das, Meera Pillai"), or that nobody is. */
export function describeTeamMembers(members: ReadonlyArray<{ name: string }>): string {
  if (members.length === 0) return t('teams.noMembers');
  return members.map((member) => member.name).join(', ');
}
