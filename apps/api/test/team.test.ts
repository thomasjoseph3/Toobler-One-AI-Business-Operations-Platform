import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F02 slice 1: listing the team and inviting a person. Whole stories by real people with their own roles, plus the usual refusals.

let database: Database;
let app: FastifyInstance;
let mail: RecordingMailSender;

beforeAll(async () => {
  database = openTestDatabase();
  mail = createRecordingMailSender();
  app = await buildTestApp(database, [], { mailSender: mail });
});
afterAll(async () => {
  await app.close();
  await database.close();
});

let emailCounter = 0;
const newEmail = () => `invitee-${Date.now()}-${(emailCounter += 1)}@example.com`;

describe('POST /api/v1/team/invitations', () => {
  it('saves the invitation, emails a single-use link, and lists it on the team', async () => {
    const owner = await signUpOwner(app, database);
    const email = newEmail();
    mail.sent.length = 0;

    const created = await owner.ok(
      'POST',
      '/team/invitations',
      { name: 'Priya Menon', email: email.toUpperCase(), mobile: '+91 98470 22222', role: 'staff' },
      201,
    );

    expect(created.invitation).toMatchObject({ name: 'Priya Menon', email, role: 'staff', isExpired: false });
    expect(created.emailSent).toBe(true);
    expect(created.link).toMatch(/\/accept-invitation\?token=[A-Za-z0-9_-]{20,}/);
    // The email carries the same link
    expect(mail.latestTokenFor(email)).toBe(created.link.split('token=')[1]);
    expect(mail.sent.find((message) => message.to === email)?.subject).toContain('invited you');

    const team = await owner.ok('GET', '/team');
    expect(team.invitations.map((invitation: { email: string }) => invitation.email)).toEqual([email]);
  });

  it('only stores a hash of the link, never the link itself', async () => {
    const owner = await signUpOwner(app, database);
    const created = await owner.ok(
      'POST',
      '/team/invitations',
      { name: 'Hari', email: newEmail(), role: 'staff' },
      201,
    );
    const token = created.link.split('token=')[1];
    const rows = await database.system
      .selectFrom('invitations')
      .select('token_hash')
      .where('account_id', '=', owner.businessId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toContain(token);
  });

  it('keeps the invitation and says the email was not sent when the mail server is down', async () => {
    const owner = await signUpOwner(app, database);
    mail.failNextSends(true);
    try {
      const created = await owner.ok(
        'POST',
        '/team/invitations',
        { name: 'Hari', email: newEmail(), role: 'staff' },
        201,
      );
      expect(created.emailSent).toBe(false);
      expect(created.link).toContain('/accept-invitation?token=');
    } finally {
      mail.failNextSends(false);
    }
    expect((await owner.ok('GET', '/team')).invitations).toHaveLength(1);
  });

  it('refuses an email that already has an account (409) and a second open invitation (409)', async () => {
    const owner = await signUpOwner(app, database);
    const other = await signUpOwner(app, database);
    expect(
      await owner.refused('POST', '/team/invitations', { name: 'X', email: other.email, role: 'staff' }, 409),
    ).toBe('EMAIL_TAKEN');
    expect(
      await owner.refused('POST', '/team/invitations', { name: 'X', email: owner.email, role: 'staff' }, 409),
    ).toBe('EMAIL_TAKEN');

    const email = newEmail();
    await owner.ok('POST', '/team/invitations', { name: 'Once', email, role: 'staff' }, 201);
    expect(await owner.refused('POST', '/team/invitations', { name: 'Twice', email, role: 'manager' }, 409)).toBe(
      'ALREADY_INVITED',
    );
  });

  it('refuses a bad request (400): no name, a bad email, a bad role, a bad mobile', async () => {
    const owner = await signUpOwner(app, database);
    await owner.refused('POST', '/team/invitations', { email: newEmail(), role: 'staff' }, 400);
    await owner.refused('POST', '/team/invitations', { name: 'A', email: 'not-an-email', role: 'staff' }, 400);
    await owner.refused('POST', '/team/invitations', { name: 'A', email: newEmail(), role: 'owner' }, 400);
    expect(
      await owner.refused(
        'POST',
        '/team/invitations',
        { name: 'A', email: newEmail(), mobile: '12345', role: 'staff' },
        400,
      ),
    ).toBe('INVALID_MOBILE');
  });

  it('is for managers only: staff and own-leads-only staff get 403, nobody signed in gets 401', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Staffer', role: 'staff' });
    const staffOwn = await addTeamMember(app, database, owner, { name: 'Ownonly', role: 'staff_own' });
    const body = { name: 'A', email: newEmail(), role: 'staff' };
    await staff.refused('POST', '/team/invitations', body, 403);
    await staffOwn.refused('POST', '/team/invitations', body, 403);
    const nobody = await app.inject({
      method: 'POST',
      url: '/api/v1/team/invitations',
      headers: unsafeRequestHeaders,
      payload: body,
    });
    expect(nobody.statusCode).toBe(401);
  });

  it('writes a line in the activity log naming who invited, with field names only', async () => {
    const owner = await signUpOwner(app, database);
    const email = newEmail();
    await owner.ok('POST', '/team/invitations', { name: 'Secret Name', email, role: 'staff' }, 201);
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'team.invited')
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]!.actor).toMatchObject({ kind: 'user', id: owner.userId });
    expect(JSON.stringify(lines[0])).not.toContain(email);
    expect(JSON.stringify(lines[0])).not.toContain('Secret Name');
  });
});

describe('GET /api/v1/team', () => {
  it('lists the people of the business with their role and status, and never another business', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Staffer', role: 'staff' });
    const stranger = await signUpOwner(app, database);

    const team = await owner.ok('GET', '/team');
    const ids = team.members.map((member: { id: string }) => member.id).sort();
    expect(ids).toEqual([owner.userId, staff.userId].sort());
    expect(team.members.find((member: { id: string }) => member.id === staff.userId)).toMatchObject({
      role: 'staff',
      status: 'active',
    });
    expect(JSON.stringify(team)).not.toContain(stranger.email);
  });

  it('is for managers only (403 for staff, 401 when nobody is signed in)', async () => {
    const owner = await signUpOwner(app, database);
    const staff: TeamMember = await addTeamMember(app, database, owner, { name: 'Staffer', role: 'staff' });
    await staff.refused('GET', '/team', undefined, 403);
    const nobody = await app.inject({ method: 'GET', url: '/api/v1/team' });
    expect(nobody.statusCode).toBe(401);
  });
});
