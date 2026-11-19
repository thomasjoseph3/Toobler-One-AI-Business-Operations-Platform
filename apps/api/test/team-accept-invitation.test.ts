import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { TEST_PASSWORD } from './support/auth';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';
import { signUpOwner, type TeamMember } from './support/team';

// F02 slice 2: the person opens the emailed link, sees who invited them, chooses a password and joins with the role the manager chose.

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
const newEmail = () => `joiner-${Date.now()}-${(emailCounter += 1)}@example.com`;
const NEW_PASSWORD = 'planet-orange-bridge-77';

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, headers: unsafeRequestHeaders, payload: payload as object });

/** The owner invites a person; returns the email, and the token from the link. */
async function invite(owner: TeamMember, role: 'manager' | 'staff' | 'staff_own' = 'staff') {
  const email = newEmail();
  const created = await owner.ok(
    'POST',
    '/team/invitations',
    { name: 'Priya Menon', email, mobile: '+91 98470 22222', role },
    201,
  );
  return { email, token: created.link.split('token=')[1] as string, invitationId: created.invitation.id as string };
}

describe('POST /api/v1/auth/invitations/preview', () => {
  it('shows who invited the person and to which business, and does not use the link up', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token } = await invite(owner, 'staff_own');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await post('/auth/invitations/preview', { token });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        name: 'Priya Menon',
        email,
        role: 'staff_own',
        invitedByName: 'Anita Nair',
      });
      expect(response.json().businessName).toContain('Nair Stays');
    }
  });

  it('answers the same 400 for an unknown, used, cancelled or expired link', async () => {
    const owner = await signUpOwner(app, database);
    const used = await invite(owner);
    expect((await post('/auth/accept-invitation', { token: used.token, password: NEW_PASSWORD })).statusCode).toBe(200);
    const cancelled = await invite(owner);
    await database.system
      .updateTable('invitations')
      .set({ cancelled_at: new Date() })
      .where('id', '=', cancelled.invitationId)
      .execute();
    const expired = await invite(owner);
    await database.system
      .updateTable('invitations')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', expired.invitationId)
      .execute();

    for (const token of ['x'.repeat(43), used.token, cancelled.token, expired.token]) {
      const response = await post('/auth/invitations/preview', { token });
      expect(response.statusCode, token).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TOKEN');
    }
  });

  it('refuses a missing or too short token (400)', async () => {
    expect((await post('/auth/invitations/preview', {})).statusCode).toBe(400);
    expect((await post('/auth/invitations/preview', { token: 'short' })).statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/accept-invitation', () => {
  it('creates the person with the chosen role in the inviting business, and they can sign in and see only what their role allows', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token } = await invite(owner, 'staff');

    const accepted = await post('/auth/accept-invitation', { token, password: NEW_PASSWORD });
    expect(accepted.statusCode, accepted.body).toBe(200);

    const login = await post('/auth/login', { email, password: NEW_PASSWORD });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json()).toMatchObject({ user: { name: 'Priya Menon', email, role: 'staff', emailVerified: true } });
    expect(login.json().business.id).toBe(owner.businessId);

    // They are in the team list, and the invitation is no longer waiting
    const team = await owner.ok('GET', '/team');
    expect(team.members.map((member: { email: string }) => member.email)).toContain(email);
    expect(team.invitations).toEqual([]);

    // A staff member cannot reach manager routes
    const cookie = login.cookies.find((candidate) => candidate.name === 'toobler_access')!;
    const refused = await app.inject({ url: '/api/v1/team', headers: { cookie: `toobler_access=${cookie.value}` } });
    expect(refused.statusCode).toBe(403);
  });

  it('gives a manager invitation the manager role', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token } = await invite(owner, 'manager');
    expect((await post('/auth/accept-invitation', { token, password: NEW_PASSWORD })).statusCode).toBe(200);
    const login = await post('/auth/login', { email, password: NEW_PASSWORD });
    expect(login.json().user.role).toBe('manager');
  });

  it('works only once: the second use of the link is a 400', async () => {
    const owner = await signUpOwner(app, database);
    const { token } = await invite(owner);
    expect((await post('/auth/accept-invitation', { token, password: NEW_PASSWORD })).statusCode).toBe(200);
    const again = await post('/auth/accept-invitation', { token, password: NEW_PASSWORD });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('INVALID_TOKEN');
  });

  it('lets only one of two requests with the same link at the same moment win', async () => {
    const owner = await signUpOwner(app, database);
    const { token } = await invite(owner);
    const answers = await Promise.all([
      post('/auth/accept-invitation', { token, password: NEW_PASSWORD }),
      post('/auth/accept-invitation', { token, password: NEW_PASSWORD }),
    ]);
    expect(answers.map((answer) => answer.statusCode).sort()).toEqual([200, 400]);
  });

  it('refuses a weak password (400) and leaves the link working for another try', async () => {
    const owner = await signUpOwner(app, database);
    const { token } = await invite(owner);
    const weak = await post('/auth/accept-invitation', { token, password: 'password12345' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('WEAK_PASSWORD');
    expect((await post('/auth/accept-invitation', { token, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('refuses a too short password (400) and an expired link (400)', async () => {
    const owner = await signUpOwner(app, database);
    const { token, invitationId } = await invite(owner);
    expect((await post('/auth/accept-invitation', { token, password: 'short' })).statusCode).toBe(400);
    await database.system
      .updateTable('invitations')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', invitationId)
      .execute();
    const response = await post('/auth/accept-invitation', { token, password: NEW_PASSWORD });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_TOKEN');
  });

  it('answers 409 when the email got an account since the invitation, and keeps the link unused', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token } = await invite(owner);
    // Someone signs up with that email before the invited person accepts
    const signUp = await post('/auth/signup', {
      name: 'Someone Else',
      businessName: 'Other Place',
      email,
      mobile: '+91 98470 33333',
      password: TEST_PASSWORD,
      industry: 'hotel_resort',
    });
    expect(signUp.statusCode, signUp.body).toBe(201);
    const response = await post('/auth/accept-invitation', { token, password: NEW_PASSWORD });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('EMAIL_TAKEN');
  });

  it('writes the activity log line for the new person, never with their email or password', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token } = await invite(owner);
    await post('/auth/accept-invitation', { token, password: NEW_PASSWORD });
    const lines = await database.system
      .selectFrom('activity_log')
      .selectAll()
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'team.invitation_accepted')
      .execute();
    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines[0])).not.toContain(email);
    expect(JSON.stringify(lines[0])).not.toContain(NEW_PASSWORD);
  });

  it('refuses a request without the web app’s safety headers (403) and a bad body (400)', async () => {
    const owner = await signUpOwner(app, database);
    const { token } = await invite(owner);
    const noHeaders = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/accept-invitation',
      payload: { token, password: NEW_PASSWORD },
    });
    expect(noHeaders.statusCode).toBe(403);
    expect((await post('/auth/accept-invitation', { token })).statusCode).toBe(400);
    expect((await post('/auth/accept-invitation', {})).statusCode).toBe(400);
  });
});
