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
