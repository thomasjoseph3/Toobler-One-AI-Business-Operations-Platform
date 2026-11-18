import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../api/client';
import {
  buildEmptyInviteForm,
  buildInviteRequest,
  checkInviteForm,
  describeRole,
  describeTeamProblem,
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
