import type { AcceptInvitationRequest, InvitationPreview } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import { findPasswordProblem, hashPassword } from '../helpers/passwords';
import { hashSecret } from '../helpers/tokens';
import * as credentialsRepository from '../repositories/credentials.repository';
import * as invitationsRepository from '../repositories/invitations.repository';
import * as usersRepository from '../repositories/users.repository';

/** The one answer for every invitation link that cannot be used, so nothing reveals which rule failed. */
const invalidLink = () =>
  new ApiError(400, 'INVALID_TOKEN', 'This invitation is not valid any more. Ask your manager to send a new one.');

/**
 * What happens when an invited person opens their link: showing who invited them, and accepting (choosing a password).
 * Both run on the owner connection because the person has no account yet and the link is found without knowing the business.
 */
export function createInvitationAcceptService({ database }: { database: Database }) {
  return {
    /** Shows the person who invited them and to which business, without using the link up. Any link that cannot be used answers 400 INVALID_TOKEN. */
    async previewInvitation(token: string): Promise<InvitationPreview> {
      const invitation = await database.runInSystemTransaction((transaction) =>
        invitationsRepository.findOpenInvitationByTokenHash(transaction, hashSecret(token)),
      );
      if (!invitation) throw invalidLink();
      return {
        name: invitation.name,
        email: invitation.email,
        role: invitation.role,
        businessName: invitation.businessName,
        invitedByName: invitation.invitedByName,
      };
    },

    /**
     * Uses the link up and creates the person, in ONE transaction: marks the invitation accepted, checks the password, adds the person with the role
     * and business of the invitation, stores the password as a hash, counts their email as verified (they opened the link we emailed), and writes
     * the activity log. If anything is refused the whole transaction is undone, so a refused weak password leaves the link working for another try.
     * The person is not signed in afterwards; they sign in with their new password.
     */
    async acceptInvitation(request: AcceptInvitationRequest): Promise<void> {
      const tokenHash = hashSecret(request.token);
      // Hashing is slow on purpose, so it is done before the transaction opens; the password rules are checked inside, once the person is known
      const passwordHash = await hashPassword(request.password);
      try {
        await database.runInSystemTransaction(async (transaction) => {
          const invitation = await invitationsRepository.findOpenInvitationByTokenHash(transaction, tokenHash);
          if (!invitation) throw invalidLink();
          const passwordProblem = findPasswordProblem(request.password, {
            email: invitation.email,
            mobileDigits: invitation.mobileE164 ? invitation.mobileE164.replace(/\D/g, '') : null,
          });
          if (passwordProblem) throw new ApiError(400, 'WEAK_PASSWORD', passwordProblem);
          // One email, one business: someone may have signed up with this address since the invitation was sent
          if (await usersRepository.emailIsRegistered(transaction, invitation.email)) {
            throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in instead.');
          }
          // Uses the link up in one statement, so two requests at the same moment cannot both win
          if (!(await invitationsRepository.markInvitationAccepted(transaction, tokenHash))) throw invalidLink();

          const userId = uuidv7();
          await usersRepository.insertUser(transaction, {
            id: userId,
            accountId: invitation.accountId,
            email: invitation.email,
            name: invitation.name,
            mobileE164: invitation.mobileE164,
            mobileKey: invitation.mobileKey,
            role: invitation.role,
            createdBy: { kind: 'user', id: invitation.invitedBy },
          });
          await credentialsRepository.insertCredentials(transaction, userId, passwordHash);
          await usersRepository.markEmailVerified(transaction, userId);
          await writeActivityLog(transaction, {
            accountId: invitation.accountId,
            actor: { kind: 'user', id: userId },
            kind: 'team.invitation_accepted',
            details: { recordType: 'user', recordId: userId, fields: ['role'] },
          });
        });
      } catch (error) {
        // Two people accepting for the same email at the same moment: the database's unique index decides who wins
        if (error instanceof Error && 'code' in error && error.code === '23505') {
          throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in instead.');
        }
        throw error;
      }
    },
  };
}

export type InvitationAcceptService = ReturnType<typeof createInvitationAcceptService>;
