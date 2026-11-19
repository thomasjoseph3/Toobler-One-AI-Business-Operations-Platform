import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { openTestDatabase } from './support/harness';
import { createRecordingMailSender, type RecordingMailSender } from './support/mail';
import { addTeamMember, signUpOwner, type TeamMember } from './support/team';

// F02 slice 4: cancelling an invitation and sending it again with a new link.

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
const newEmail = () => `later-${Date.now()}-${(emailCounter += 1)}@example.com`;
const NEW_PASSWORD = 'planet-orange-bridge-77';

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url: `/api/v1${url}`, headers: unsafeRequestHeaders, payload: payload as object });

async function invite(owner: TeamMember) {
  const email = newEmail();
  const created = await owner.ok('POST', '/team/invitations', { name: 'Priya Menon', email, role: 'staff' }, 201);
  return { email, token: created.link.split('token=')[1] as string, id: created.invitation.id as string };
}

describe('DELETE /api/v1/team/invitations/{id}', () => {
  it('cancels the invitation: it leaves the list, its link stops working, and the email can be invited again', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token, id } = await invite(owner);

    await owner.ok('DELETE', `/team/invitations/${id}`, undefined, 204);

    expect((await owner.ok('GET', '/team')).invitations).toEqual([]);
    expect((await post('/auth/accept-invitation', { token, password: NEW_PASSWORD })).statusCode).toBe(400);
    await owner.ok('POST', '/team/invitations', { name: 'Priya Again', email, role: 'staff' }, 201);
  });

  it('answers 404 for a second cancel, an accepted invitation, an unknown id and another business’s invitation', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const strangersInvitation = await invite(stranger);
    const accepted = await invite(owner);
    await post('/auth/accept-invitation', { token: accepted.token, password: NEW_PASSWORD });
    const cancelled = await invite(owner);
    await owner.ok('DELETE', `/team/invitations/${cancelled.id}`, undefined, 204);

    await owner.refused('DELETE', `/team/invitations/${cancelled.id}`, undefined, 404);
    await owner.refused('DELETE', `/team/invitations/${accepted.id}`, undefined, 404);
    await owner.refused('DELETE', `/team/invitations/${randomUUID()}`, undefined, 404);
    await owner.refused('DELETE', `/team/invitations/${strangersInvitation.id}`, undefined, 404);
    // The stranger's invitation is untouched
    expect((await stranger.ok('GET', '/team')).invitations).toHaveLength(1);
  });

  it('is for managers only (403) and needs a sign-in (401); a bad id is 400', async () => {
    const owner = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Staffer', role: 'staff' });
    const { id } = await invite(owner);
    await staff.refused('DELETE', `/team/invitations/${id}`, undefined, 403);
    await owner.refused('DELETE', '/team/invitations/not-an-id', undefined, 400);
    const nobody = await app.inject({
      method: 'DELETE',
      url: `/api/v1/team/invitations/${id}`,
      headers: unsafeRequestHeaders,
    });
    expect(nobody.statusCode).toBe(401);
  });

  it('writes the activity log line', async () => {
    const owner = await signUpOwner(app, database);
    const { id } = await invite(owner);
    await owner.ok('DELETE', `/team/invitations/${id}`, undefined, 204);
    const lines = await database.system
      .selectFrom('activity_log')
      .select('record_id')
      .where('account_id', '=', owner.businessId)
      .where('kind', '=', 'team.invitation_cancelled')
      .execute();
    expect(lines).toEqual([{ record_id: id }]);
  });
});

describe('POST /api/v1/team/invitations/{id}/resend', () => {
  it('emails a NEW link: the old one stops working and the new one works', async () => {
    const owner = await signUpOwner(app, database);
    const { email, token: oldToken, id } = await invite(owner);
    mail.sent.length = 0;

    const resent = await owner.ok('POST', `/team/invitations/${id}/resend`);
    const newToken = resent.link.split('token=')[1] as string;
    expect(newToken).not.toBe(oldToken);
    expect(resent.emailSent).toBe(true);
    expect(mail.latestTokenFor(email)).toBe(newToken);
    expect(resent.invitation).toMatchObject({ id, email, isExpired: false });

    expect((await post('/auth/accept-invitation', { token: oldToken, password: NEW_PASSWORD })).statusCode).toBe(400);
    expect((await post('/auth/accept-invitation', { token: newToken, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('brings an expired invitation back to life', async () => {
    const owner = await signUpOwner(app, database);
    const { id } = await invite(owner);
    await database.system
      .updateTable('invitations')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', id)
      .execute();
    expect((await owner.ok('GET', '/team')).invitations[0].isExpired).toBe(true);

    const resent = await owner.ok('POST', `/team/invitations/${id}/resend`);
    expect(resent.invitation.isExpired).toBe(false);
    expect((await owner.ok('GET', '/team')).invitations[0].isExpired).toBe(false);
  });

  it('keeps the new link and says the email was not sent when the mail server is down', async () => {
    const owner = await signUpOwner(app, database);
    const { id } = await invite(owner);
    mail.failNextSends(true);
    try {
      const resent = await owner.ok('POST', `/team/invitations/${id}/resend`);
      expect(resent.emailSent).toBe(false);
      expect(resent.link).toContain('/accept-invitation?token=');
    } finally {
      mail.failNextSends(false);
    }
  });

  it('answers 404 for a cancelled, accepted, unknown or another business’s invitation, 403 for staff, 401 for nobody', async () => {
    const owner = await signUpOwner(app, database);
    const stranger = await signUpOwner(app, database);
    const staff = await addTeamMember(app, database, owner, { name: 'Staffer', role: 'staff' });
    const strangersInvitation = await invite(stranger);
    const cancelled = await invite(owner);
    await owner.ok('DELETE', `/team/invitations/${cancelled.id}`, undefined, 204);
    const accepted = await invite(owner);
    await post('/auth/accept-invitation', { token: accepted.token, password: NEW_PASSWORD });

    await owner.refused('POST', `/team/invitations/${cancelled.id}/resend`, undefined, 404);
    await owner.refused('POST', `/team/invitations/${accepted.id}/resend`, undefined, 404);
    await owner.refused('POST', `/team/invitations/${randomUUID()}/resend`, undefined, 404);
    await owner.refused('POST', `/team/invitations/${strangersInvitation.id}/resend`, undefined, 404);
    await staff.refused('POST', `/team/invitations/${strangersInvitation.id}/resend`, undefined, 403);
    const nobody = await app.inject({
      method: 'POST',
      url: `/api/v1/team/invitations/${cancelled.id}/resend`,
      headers: unsafeRequestHeaders,
    });
    expect(nobody.statusCode).toBe(401);
  });
});
