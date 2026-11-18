import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../api/client';
import {
  buildEmptyInviteForm,
  buildEmptyTeamForm,
  buildInviteRequest,
  checkAcceptPassword,
  checkInviteForm,
  checkTeamForm,
  describeAcceptProblem,
  describeRole,
  describeTeamMembers,
  describeTeamProblem,
  listHandOverChoices,
  listOtherRoles,
  toggleTeamMember,
} from './team-state';

describe('the Invite form', () => {
  it('starts empty with plain staff chosen', () => {
    expect(buildEmptyInviteForm()).toEqual({ name: '', email: '', mobile: '', role: 'staff' });
  });

  it('asks for a name and a real-looking email, and accepts an empty mobile', () => {
    expect(checkInviteForm(buildEmptyInviteForm())).toEqual({
      name: 'team.invite.problem.name',
      email: 'team.invite.problem.email',
    });
    expect(checkInviteForm({ name: 'Priya', email: 'priya@example.com', mobile: '', role: 'staff' })).toEqual({});
  });

  it('refuses an email without a dot and a mobile that is too short', () => {
    const problems = checkInviteForm({ name: 'Priya', email: 'priya@example', mobile: '123', role: 'manager' });
    expect(problems.email).toBe('team.invite.problem.email');
    expect(problems.mobile).toBe('team.invite.problem.mobile');
  });

  it('leaves the mobile out of the request when it is empty, and trims what was typed', () => {
    expect(
      buildInviteRequest({ name: ' Priya ', email: ' priya@example.com ', mobile: '  ', role: 'staff_own' }),
    ).toEqual({
      name: 'Priya',
      email: 'priya@example.com',
      role: 'staff_own',
    });
    expect(
      buildInviteRequest({ name: 'P', email: 'p@example.com', mobile: '+91 98470 12345', role: 'staff' }).mobile,
    ).toBe('+91 98470 12345');
  });
});

describe('roles and refusals in words', () => {
  it('names the three roles', () => {
    expect(describeRole('manager')).toBe('Manager');
    expect(describeRole('staff')).toBe('Staff');
    expect(describeRole('staff_own')).toBe('Staff (own leads only)');
  });

  it('shows the API’s own words for a 409 and a general sentence for anything else', () => {
    expect(
      describeTeamProblem(
        new ApiRequestError(409, 'ALREADY_INVITED', 'This person already has an invitation waiting.'),
      ),
    ).toBe('This person already has an invitation waiting.');
    expect(describeTeamProblem(new ApiRequestError(500, 'UNKNOWN_ERROR', 'boom'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(describeTeamProblem(new ApiRequestError(0, 'NETWORK', 'offline'))).toContain('connect');
  });
});

describe('the accept page', () => {
  it('asks for a password of at least ten characters', () => {
    expect(checkAcceptPassword('')).toBe('accept.problem.passwordMissing');
    expect(checkAcceptPassword('short')).toBe('accept.problem.passwordShort');
    expect(checkAcceptPassword('long-enough-1')).toBeUndefined();
  });

  it('says a link that cannot be used in its own words, and shows the API’s words for a weak password', () => {
    expect(describeAcceptProblem(new ApiRequestError(400, 'INVALID_TOKEN', 'x'))).toContain('Ask your manager');
    expect(describeAcceptProblem(new ApiRequestError(400, 'WEAK_PASSWORD', 'That password is too common.'))).toBe(
      'That password is too common.',
    );
    expect(describeAcceptProblem(new ApiRequestError(500, 'UNKNOWN_ERROR', 'boom'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('changing a role and removing a person', () => {
  it('offers the two other roles', () => {
    expect(listOtherRoles('staff')).toEqual(['staff_own', 'manager']);
    expect(listOtherRoles('manager')).toEqual(['staff', 'staff_own']);
  });

  it('offers only people still working, never the person being removed', () => {
    const members = [
      { id: 'a', name: 'Anita', status: 'active' as const },
      { id: 'b', name: 'Rahul', status: 'active' as const },
      { id: 'c', name: 'Gone', status: 'disabled' as const },
    ];
    expect(listHandOverChoices(members, 'b')).toEqual([{ value: 'a', label: 'Anita' }]);
  });
});

describe('the team form', () => {
  it('starts empty, and asks for a name', () => {
    expect(buildEmptyTeamForm()).toEqual({ name: '', memberIds: [] });
    expect(checkTeamForm({ name: '   ', memberIds: [] })).toBe('teams.form.problem.name');
    expect(checkTeamForm({ name: 'Sales', memberIds: [] })).toBeUndefined();
  });

  it('ticks and unticks people, keeping the order', () => {
    let fields = buildEmptyTeamForm();
    fields = toggleTeamMember(fields, 'rahul');
    fields = toggleTeamMember(fields, 'meera');
    expect(fields.memberIds).toEqual(['rahul', 'meera']);
    expect(toggleTeamMember(fields, 'rahul').memberIds).toEqual(['meera']);
  });

  it('says who is in a team, or that nobody is', () => {
    expect(describeTeamMembers([{ name: 'Rahul Das' }, { name: 'Meera Pillai' }])).toBe('Rahul Das, Meera Pillai');
    expect(describeTeamMembers([])).toBe('Nobody is in this team yet.');
  });
});
