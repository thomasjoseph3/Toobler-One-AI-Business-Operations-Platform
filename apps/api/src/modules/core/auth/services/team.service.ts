import type { FastifyBaseLogger } from 'fastify';
import type { InvitationCreated, InviteMemberRequest, TeamResponse } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import type { MailSender } from '../../../../providers/mail';
import { buildInvitationEmail } from '../helpers/invitation-email';
import { normaliseMobile } from '../helpers/phone';
import { generateSecret, hashSecret } from '../helpers/tokens';
import * as accountsRepository from '../repositories/accounts.repository';
import * as invitationsRepository from '../repositories/invitations.repository';
import * as usersRepository from '../repositories/users.repository';

/** How long an emailed invitation works (docs/SECURITY.md: invitations last 48 hours; a manager can send a new one). */
export const INVITATION_HOURS = 48;

// The country code added to a mobile number typed without one (91 = India), as at sign-up.
const DEFAULT_COUNTRY_CODE = '91';

/** Turns a date from the database into the ISO text the API sends. */
const toIso = (date: Date) => date.toISOString();

/** Turns an invitation row into what the API sends. */
function describeInvitation(row: invitationsRepository.InvitationRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mobile: row.mobile,
    role: row.role,
    invitedAt: toIso(row.invitedAt),
    expiresAt: toIso(row.expiresAt),
    isExpired: row.isExpired,
  };
}

/**
 * Everything about the people of a business: listing them and inviting a new one. The routes call this.
 * Repositories used: users, invitations, accounts (all in ../repositories). Emails the invitation.
 */
export function createTeamService({
  config,
  database,
  mail,
  logger,
}: {
  config: Config;
  database: Database;
  mail: MailSender;
  logger: FastifyBaseLogger;
}) {
  return {
    /** The people of the business and the invitations still waiting. */
    async listTeam(principal: Pick<Principal, 'accountId'>): Promise<TeamResponse> {
      const { members, invitations } = await database.runInAccountTransaction(
        principal.accountId,
        async (transaction) => ({
          members: await usersRepository.listTeamMembers(transaction, principal.accountId),
          invitations: await invitationsRepository.listOpenInvitations(transaction, principal.accountId),
        }),
      );
      return {
        members: members.map((member) => ({
          ...member,
          lastSignedInAt: member.lastSignedInAt ? toIso(member.lastSignedInAt) : null,
        })),
        invitations: invitations.map(describeInvitation),
      };
    },

    /**
     * Invites a person: saves the invitation (only a hash of the link), writes the activity log line, then emails the link. A failed email
     * does not undo the invitation (the answer says `emailSent: false` and the manager can still copy the link). An email that already has
     * an account anywhere, or an open invitation here, answers 409.
     */
    async inviteMember(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: InviteMemberRequest,
    ): Promise<InvitationCreated> {
      let mobile: ReturnType<typeof normaliseMobile> = null;
      if (request.mobile !== undefined) {
        mobile = normaliseMobile(request.mobile, DEFAULT_COUNTRY_CODE);
        if (!mobile) throw new ApiError(400, 'INVALID_MOBILE', 'Enter a valid mobile number, like +91 98470 12345.');
      }
      // One email belongs to one business, so look in every business (the owner connection), not only this one
      const emailTaken = await database.runInSystemTransaction((transaction) =>
        usersRepository.emailIsRegistered(transaction, request.email),
      );
      if (emailTaken) {
        throw conflict('EMAIL_TAKEN', 'Someone with this email already has an account, so they cannot be invited.');
      }

      const rawToken = generateSecret();
      let created;
      try {
        created = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
          const business = await accountsRepository.findAccountById(transaction, principal.accountId);
          const inviter = await usersRepository.findPersonProfileById(transaction, principal.userId);
          if (!business || !inviter) throw notFound('Your account');
          const invitation = await invitationsRepository.insertInvitation(transaction, {
            id: uuidv7(),
            accountId: principal.accountId,
            email: request.email,
            name: request.name,
            mobileE164: mobile?.e164 ?? null,
            mobileKey: mobile?.key ?? null,
            role: request.role,
            tokenHash: hashSecret(rawToken),
            invitedBy: principal.userId,
            hours: INVITATION_HOURS,
          });
          await writeActivityLog(transaction, {
            accountId: principal.accountId,
            actor: { kind: 'user', id: principal.userId },
            kind: 'team.invited',
            details: { recordType: 'invitation', recordId: invitation.id, fields: ['role'] },
          });
          return { invitation, businessName: business.name, invitedByName: inviter.name };
        });
      } catch (error) {
        // Two invitations to the same address: the database's unique index says the first is still open
        if (error instanceof Error && 'code' in error && error.code === '23505') {
          throw conflict(
            'ALREADY_INVITED',
            'This person already has an invitation waiting. Cancel it or send it again.',
          );
        }
        throw error;
      }

      // The link opens a page in the web app; that page sends the token to the accept route. Opening the link changes nothing.
      const link = `${config.webUrl}/accept-invitation?token=${rawToken}`;
      let emailSent = true;
      try {
        await mail.send(
          buildInvitationEmail({
            to: request.email,
            personName: request.name,
            businessName: created.businessName,
            invitedByName: created.invitedByName,
            link,
            hours: INVITATION_HOURS,
          }),
        );
      } catch (error) {
        emailSent = false;
        logger.error(
          { reason: error instanceof Error ? error.name : 'unknown' },
          'could not send the invitation email',
        );
      }
      return { invitation: describeInvitation(created.invitation), link, emailSent };
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
