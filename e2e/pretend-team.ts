// The pretend team for the browser tests. It answers the same calls as the real API (`GET /team`, `POST /team/invitations`), keeps what the
// page sent, and can be told to refuse the next invitation.

import type { PretendAnswer } from './pretend-knowledge';

export interface PretendTeam {
  members: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  /** What the page sent to invite someone. */
  postedInvitations: Array<Record<string, unknown>>;
  /** When set, the next invitation is refused with this status, code and message. */
  refusal: { status: number; code: string; message: string } | null;
  /** Whether the email of the next invitation goes out (false = the mail server is down, the link is still given). */
  emailWorks: boolean;
  fails: boolean;
}

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
      },
      {
        id: 'member-staff-1',
        name: 'Rahul Das',
        email: 'rahul@example.com',
        mobile: null,
        role: 'staff',
        status: 'active',
        lastSignedInAt: null,
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
    postedInvitations: [],
    refusal: null,
    emailWorks: true,
    fails: false,
  };
}

/** Answers a team call, or undefined when it is not one. */
export function answerTeamCall(
  state: PretendTeam,
  call: { method: string; path: string; body: Record<string, unknown> | null; role: 'manager' | 'staff' },
): PretendAnswer | undefined {
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
