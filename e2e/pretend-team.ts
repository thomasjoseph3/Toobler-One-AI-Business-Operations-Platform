// The pretend team for the browser tests. It answers the same calls as the real API (`GET /team`, `POST /team/invitations`), keeps what the
// page sent, and can be told to refuse the next invitation.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendTeam {
  members: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  /** The business's teams, with their people, as the real API sends them. */
  teams: Array<{ id: string; name: string; members: Array<{ userId: string; name: string }> }>;
  /** What the page sent to add a team. */
  postedTeams: Array<Record<string, unknown>>;
  /** What the page sent to invite someone. */
  postedInvitations: Array<Record<string, unknown>>;
  /** When set, the next invitation is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** Whether the email of the next invitation goes out (false = the mail server is down, the link is still given). */
  emailWorks: boolean;
  fails: boolean;
  /** What the accept page sent (the token and a note of how long the password was; the password itself is never kept). */
  /** What the page sent to change a person (role or add back), and the removals (with who takes over). */
  patchedMembers: Array<{ memberId: string; body: Record<string, unknown> }>;
  removedMembers: Array<{ memberId: string; handOverTo: string | null }>;
  /** The invitations the page cancelled or sent again. */
  cancelledInvitationIds: string[];
  resentInvitationIds: string[];
  acceptedInvitations: Array<{ token: string; passwordLength: number }>;
}

/** The link token the pretend API accepts; any other token is "not valid any more". */
export const GOOD_INVITATION_TOKEN = 'good-invitation-token-0123456789';

/** The business's people at the start of a test: the signed-in manager and one staff member, and one invitation waiting. */
export function startingTeam(managerId: string, managerName: string, managerEmail: string): PretendTeam {
  return {
    members: [
      {
        id: managerId,
        name: managerName,
        email: managerEmail,
        mobile: '+919847012345',
        role: 'manager',
        status: 'active',
        lastSignedInAt: '2026-11-17T09:00:00.000Z',
        teams: [],
      },
      {
        id: 'member-staff-1',
        name: 'Rahul Das',
        email: 'rahul@example.com',
        mobile: null,
        role: 'staff',
        status: 'active',
        lastSignedInAt: null,
        teams: [{ id: 'team-1', name: 'Front office' }],
      },
    ],
    invitations: [
      {
        id: 'invitation-1',
        name: 'Meera Pillai',
        email: 'meera@example.com',
        mobile: null,
        role: 'staff_own',
        invitedAt: '2026-11-16T10:00:00.000Z',
        expiresAt: '2026-11-18T10:00:00.000Z',
        isExpired: false,
      },
    ],
    teams: [{ id: 'team-1', name: 'Front office', members: [{ userId: 'member-staff-1', name: 'Rahul Das' }] }],
    postedTeams: [],
    postedInvitations: [],
    refusal: null,
    emailWorks: true,
    fails: false,
    patchedMembers: [],
    removedMembers: [],
    cancelledInvitationIds: [],
    resentInvitationIds: [],
    acceptedInvitations: [],
  };
}

/** Answers a team call, or undefined when it is not one. */
export function answerTeamCall(
  state: PretendTeam,
  call: {
    method: string;
    path: string;
    search?: string;
    body: Record<string, unknown> | null;
    role: 'manager' | 'staff';
  },
): PretendAnswer | undefined {
  if (call.path === '/auth/invitations/preview' || call.path === '/auth/accept-invitation') {
    const invalid = {
      status: 400,
      body: { error: { code: 'INVALID_TOKEN', message: 'This invitation is not valid any more.' } },
    };
    if (call.body?.['token'] !== GOOD_INVITATION_TOKEN) return invalid;
    if (call.path === '/auth/invitations/preview') {
      return {
        status: 200,
        body: {
          name: 'Hari Kumar',
          email: 'hari@example.com',
          role: 'staff_own',
          businessName: 'Nair Stays',
          invitedByName: 'Anita Nair',
        },
      };
    }
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.acceptedInvitations.push({
      token: String(call.body['token']),
      passwordLength: String(call.body['password']).length,
    });
    return { status: 200, body: { ok: true } };
  }
  const memberMatch = /^\/team\/members\/([\w-]+)$/u.exec(call.path);
  if (memberMatch) {
    if (call.role !== 'manager')
      return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
    const member = state.members.find((candidate) => candidate['id'] === memberMatch[1]);
    if (!member) return { status: 404, body: { error: { code: 'NOT_FOUND', message: "That person wasn't found." } } };
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    if (call.method === 'PATCH') {
      state.patchedMembers.push({ memberId: memberMatch[1]!, body: call.body ?? {} });
      if (call.body?.['role']) member['role'] = call.body['role'];
      if (call.body?.['status'] === 'active') member['status'] = 'active';
      return { status: 200, body: member };
    }
    if (call.method === 'DELETE') {
      state.removedMembers.push({
        memberId: memberMatch[1]!,
        handOverTo: new URLSearchParams(call.search ?? '').get('hand_over_to'),
      });
      member['status'] = 'disabled';
      return { status: 204 };
    }
    return undefined;
  }
  const invitationMatch = /^\/team\/invitations\/([\w-]+)(\/resend)?$/u.exec(call.path);
  if (invitationMatch) {
    if (call.role !== 'manager')
      return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
    const invitation = state.invitations.find((candidate) => candidate['id'] === invitationMatch[1]);
    if (!invitation)
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: "That invitation wasn't found." } } };
    if (call.method === 'DELETE' && !invitationMatch[2]) {
      state.cancelledInvitationIds.push(String(invitation['id']));
      state.invitations = state.invitations.filter((candidate) => candidate !== invitation);
      return { status: 204 };
    }
    if (call.method === 'POST' && invitationMatch[2]) {
      state.resentInvitationIds.push(String(invitation['id']));
      invitation['isExpired'] = false;
      return {
        status: 200,
        body: {
          invitation,
          link: 'http://localhost:3000/accept-invitation?token=resent123456789abcdefghij',
          emailSent: state.emailWorks,
        },
      };
    }
    return undefined;
  }
  if (call.path === '/teams') {
    if (call.method === 'GET') {
      if (state.fails) return { status: 500, body: { error: { code: 'UNKNOWN_ERROR', message: 'Down.' } } };
      return { status: 200, body: { items: state.teams } };
    }
    if (call.method === 'POST') {
      if (call.role !== 'manager')
        return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
      if (state.refusal) {
        const { status, code, message } = state.refusal;
        state.refusal = null;
        return { status, body: { error: { code, message } } };
      }
      state.postedTeams.push(call.body ?? {});
      const memberIds = (call.body?.['memberIds'] as string[] | undefined) ?? [];
      const team = {
        id: `team-new-${state.postedTeams.length}`,
        name: String(call.body?.['name']),
        members: state.members
          .filter((member) => memberIds.includes(String(member['id'])))
          .map((member) => ({ userId: String(member['id']), name: String(member['name']) })),
      };
      state.teams.push(team);
      return { status: 201, body: team };
    }
    return undefined;
  }
  if (call.path !== '/team' && call.path !== '/team/invitations') return undefined;
  if (call.role !== 'manager') return { status: 403, body: { error: { code: 'FORBIDDEN', message: 'Not allowed.' } } };
  if (call.path === '/team' && call.method === 'GET') {
    if (state.fails) return { status: 500, body: { error: { code: 'UNKNOWN_ERROR', message: 'Down.' } } };
    return { status: 200, body: { members: state.members, invitations: state.invitations } };
  }
  if (call.path === '/team/invitations' && call.method === 'POST') {
    if (state.refusal) {
      const { status, code, message } = state.refusal;
      state.refusal = null;
      return { status, body: { error: { code, message } } };
    }
    state.postedInvitations.push(call.body ?? {});
    const invitation = {
      id: `invitation-new-${state.postedInvitations.length}`,
      name: String(call.body?.['name']),
      email: String(call.body?.['email']).toLowerCase(),
      mobile: call.body?.['mobile'] ?? null,
      role: call.body?.['role'],
      invitedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      isExpired: false,
    };
    state.invitations.unshift(invitation);
    return {
      status: 201,
      body: {
        invitation,
        link: 'http://localhost:3000/accept-invitation?token=abc123def456ghi789jkl',
        emailSent: state.emailWorks,
      },
    };
  }
  return undefined;
}
