import type { FastifyBaseLogger } from 'fastify';
import type {
  InvitationCreated,
  InviteMemberRequest,
  TeamMember,
  TeamResponse,
  UpdateTeamMemberRequest,
} from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { publishEvent } from '../../../../kernel/events/publish';
import { uuidv7 } from '../../../../kernel/ids';
import type { MailSender } from '../../../../providers/mail';
import { buildInvitationEmail } from '../helpers/invitation-email';
import { normaliseMobile } from '../helpers/phone';
import { generateSecret, hashSecret } from '../helpers/tokens';
import * as accountsRepository from '../repositories/accounts.repository';
import * as invitationsRepository from '../repositories/invitations.repository';
import * as sessionsRepository from '../repositories/sessions.repository';
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

/** Turns a person row into what the API sends. */
function describeMember(row: usersRepository.TeamMemberRow): TeamMember {
  return { ...row, lastSignedInAt: row.lastSignedInAt ? toIso(row.lastSignedInAt) : null };
}

/**
 * Everything about the people of a business: listing them, inviting a new one, changing a role, and removing or adding back a person. The routes call this.
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
  /** Emails an invitation link. A failed send is logged (never with the address or the link) and answered with false, so the manager can still copy the link. */
  async function sendInvitationEmail(details: {
    to: string;
    personName: string;
    businessName: string;
    invitedByName: string;
    link: string;
  }): Promise<boolean> {
    try {
      await mail.send(buildInvitationEmail({ ...details, hours: INVITATION_HOURS }));
      return true;
    } catch (error) {
      logger.error({ reason: error instanceof Error ? error.name : 'unknown' }, 'could not send the invitation email');
      return false;
    }
  }

  return {
    /**
     * Cancels an invitation that has not been accepted: its link stops working at once, and the email can be invited again. An unknown,
     * used or already cancelled invitation, and another business's, answer 404.
     */
    async cancelInvitation(principal: Pick<Principal, 'accountId' | 'userId'>, invitationId: string): Promise<void> {
      await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const invitation = await invitationsRepository.findOpenInvitationForUpdate(
          transaction,
          principal.accountId,
          invitationId,
        );
        if (!invitation) throw notFound('That invitation');
        await invitationsRepository.cancelInvitation(transaction, principal.accountId, invitationId);
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'team.invitation_cancelled',
          details: { recordType: 'invitation', recordId: invitationId },
        });
      });
    },

    /**
     * Sends an invitation again with a NEW link (the old link stops working) that works for 48 hours from now; also the way to revive an expired
     * invitation. Answers like inviting does: the link (shown only now) and whether the email went out. An unknown, used or cancelled invitation, and
     * another business's, answer 404.
     */
    async resendInvitation(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      invitationId: string,
    ): Promise<InvitationCreated> {
      const rawToken = generateSecret();
      const renewed = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const invitation = await invitationsRepository.findOpenInvitationForUpdate(
          transaction,
          principal.accountId,
          invitationId,
        );
        if (!invitation) throw notFound('That invitation');
        const business = await accountsRepository.findAccountById(transaction, principal.accountId);
        const sender = await usersRepository.findPersonProfileById(transaction, principal.userId);
        if (!business || !sender) throw notFound('Your account');
        const renewedInvitation = await invitationsRepository.renewInvitation(transaction, {
          accountId: principal.accountId,
          invitationId,
          tokenHash: hashSecret(rawToken),
          hours: INVITATION_HOURS,
        });
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'team.invitation_resent',
          details: { recordType: 'invitation', recordId: invitationId },
        });
        return { invitation: renewedInvitation, businessName: business.name, invitedByName: sender.name };
      });
      const link = `${config.webUrl}/accept-invitation?token=${rawToken}`;
      const emailSent = await sendInvitationEmail({
        to: renewed.invitation.email,
        personName: renewed.invitation.name,
        businessName: renewed.businessName,
        invitedByName: renewed.invitedByName,
        link,
      });
      return { invitation: describeInvitation(renewed.invitation), link, emailSent };
    },

    /**
     * Changes a person's role (it takes effect on their very next request, since the role is read from the database every time) and/or adds a
     * removed person back. The business always keeps at least one active manager: demoting the last one answers 409 LAST_MANAGER. A removed person's
     * role cannot be changed until they are added back (409). An unknown person, or one of another business, answers 404.
     */
    async updateMember(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      memberId: string,
      request: UpdateTeamMemberRequest,
    ): Promise<TeamMember> {
      return database.runInAccountTransaction(principal.accountId, async (transaction) => {
        // Lock the managers first, then the person, always in this order, so two changes at once take turns
        const activeManagerIds = await usersRepository.lockActiveManagerIds(transaction, principal.accountId);
        const member = await usersRepository.findTeamMemberForUpdate(transaction, principal.accountId, memberId);
        if (!member) throw notFound('That person');

        const changes: { role?: 'manager' | 'staff' | 'staff_own'; status?: 'active' | 'disabled' } = {};
        const changedFields: string[] = [];
        if (request.role !== undefined && request.role !== member.role) {
          if (member.status === 'disabled') {
            throw conflict('MEMBER_REMOVED', 'This person was removed. Add them back first.');
          }
          const isLastManager = member.role === 'manager' && activeManagerIds.length <= 1;
          if (isLastManager) {
            throw conflict(
              'LAST_MANAGER',
              'The business needs at least one manager. Make someone else a manager first.',
            );
          }
          changes.role = request.role;
          changedFields.push('role');
        }
        if (request.status === 'active' && member.status === 'disabled') {
          changes.status = 'active';
          changedFields.push('status');
        }
        if (changedFields.length === 0) return describeMember(member);

        await usersRepository.changeTeamMember(transaction, {
          accountId: principal.accountId,
          userId: memberId,
          changes,
          changedBy: principal.userId,
        });
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: changes.status ? 'team.member_restored' : 'team.role_changed',
          details: { recordType: 'user', recordId: memberId, fields: changedFields },
        });
        return describeMember({ ...member, ...changes });
      });
    },

    /**
     * Removes a person: they can no longer sign in (their sessions end at once) and their open leads, tasks and tickets go to `handOverToUserId`
     * (the manager removing them when not given). The row is kept, because their notes and the activity log point at them, and a manager can add them
     * back. Nobody can remove themselves (409 CANNOT_REMOVE_SELF), and the last manager cannot be removed (409 LAST_MANAGER). Removing someone already
     * removed does nothing. The hand-over itself is done by the leads, tasks, tickets and offerings modules, which listen for `team.member_removed`.
     */
    async removeMember(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      memberId: string,
      handOverToUserId: string | undefined,
    ): Promise<void> {
      if (memberId === principal.userId) {
        throw conflict('CANNOT_REMOVE_SELF', 'You cannot remove yourself. Ask another manager to do it.');
      }
      const wasRemovedNow = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const activeManagerIds = await usersRepository.lockActiveManagerIds(transaction, principal.accountId);
        const member = await usersRepository.findTeamMemberForUpdate(transaction, principal.accountId, memberId);
        if (!member) throw notFound('That person');
        if (member.status === 'disabled') return false;
        if (member.role === 'manager' && activeManagerIds.length <= 1) {
          throw conflict('LAST_MANAGER', 'The business needs at least one manager. Make someone else a manager first.');
        }
        const takeOverUserId = handOverToUserId ?? principal.userId;
        const takeOver = await usersRepository.findTeamMemberForUpdate(
          transaction,
          principal.accountId,
          takeOverUserId,
        );
        if (!takeOver) throw notFound('The person to hand over to');
        if (takeOver.status !== 'active' || takeOver.id === memberId) {
          throw new ApiError(
            400,
            'INVALID_HAND_OVER',
            'Choose another person who is working in the business to take over.',
          );
        }

        await usersRepository.changeTeamMember(transaction, {
          accountId: principal.accountId,
          userId: memberId,
          changes: { status: 'disabled' },
          changedBy: principal.userId,
        });
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'team.member_removed',
          details: { recordType: 'user', recordId: memberId, fields: ['status'] },
        });
        // Ids only: the leads, tasks, tickets and offerings modules move their open items to the person who takes over
        await publishEvent(transaction, {
          accountId: principal.accountId,
          eventName: 'team.member_removed',
          payload: { userId: memberId, handOverToUserId: takeOverUserId, removedBy: principal.userId },
        });
        return true;
      });
      // The sessions table is closed to the business's own connection, so ending the person's sessions is a separate step. The person
      // could not use a session anyway (the sign-in check refuses a removed person), so this is tidiness, not the lock.
      if (wasRemovedNow) {
        await database.runInSystemTransaction((transaction) =>
          sessionsRepository.revokeAllSessionsForUser(transaction, memberId, 'removed from the team'),
        );
      }
    },

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
        members: members.map(describeMember),
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
      const emailSent = await sendInvitationEmail({
        to: request.email,
        personName: request.name,
        businessName: created.businessName,
        invitedByName: created.invitedByName,
        link,
      });
      return { invitation: describeInvitation(created.invitation), link, emailSent };
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
