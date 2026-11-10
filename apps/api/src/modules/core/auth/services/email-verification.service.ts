import type { FastifyBaseLogger } from 'fastify';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { uuidv7 } from '../../../../kernel/ids';
import type { MailSender } from '../../../../providers/mail';
import { buildVerificationEmail } from '../helpers/verification-email';
import { generateSecret, hashSecret } from '../helpers/tokens';
import * as authTokensRepository from '../repositories/auth-tokens.repository';
import * as usersRepository from '../repositories/users.repository';

/** How long an emailed verification link works. */
export const VERIFICATION_LINK_HOURS = 48;

/**
 * Everything about confirming an email address: sending the link, using it, and sending a new one.
 * Repositories used: auth-tokens, users (both in ../repositories).
 */
export function createEmailVerificationService({
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
  /**
   * Makes a fresh link for the person (the older unused ones stop working) and emails it. The link is saved first, in its
   * own transaction, and the email is sent after that is committed. Throws if the email could not be sent.
   */
  async function sendVerificationEmail(userId: string): Promise<void> {
    const rawToken = generateSecret();
    const person = await database.runInSystemTransaction(async (transaction) => {
      const found = await usersRepository.findPersonForEmail(transaction, userId);
      if (!found) return undefined;
      await authTokensRepository.deleteUnusedAuthTokens(transaction, userId, 'verify_email');
      await authTokensRepository.insertAuthToken(transaction, {
        id: uuidv7(),
        userId,
        purpose: 'verify_email',
        tokenHash: hashSecret(rawToken),
        hours: VERIFICATION_LINK_HOURS,
      });
      return found;
    });
    if (!person) return;
    // The link opens a page in the web app; that page sends the token to POST /auth/verify-email. The link itself never
    // changes anything, so an email scanner that opens it does no harm.
    const link = `${config.webUrl}/verify-email?token=${rawToken}`;
    await mail.send(buildVerificationEmail(person, link, VERIFICATION_LINK_HOURS));
  }

  return {
    /**
     * Sends the verification email right after sign-up. A failure is logged (never with the address or the link) and
     * swallowed: the account already exists, and the person can ask for another email.
     */
    async sendAfterSignUp(userId: string): Promise<void> {
      try {
        await sendVerificationEmail(userId);
      } catch (error) {
        logger.error(
          { userId, reason: error instanceof Error ? error.name : 'unknown' },
          'could not send the verification email',
        );
      }
    },

    /**
     * Sends a new verification link to the signed-in person's own address. Throws 409 if they are already verified, or 502
     * if the mail server did not take the message (so the screen can tell them to try again).
     */
    async resend(principal: Principal): Promise<void> {
      if (principal.emailVerified) throw conflict('ALREADY_VERIFIED', 'Your email is already verified.');
      try {
        await sendVerificationEmail(principal.userId);
      } catch (error) {
        logger.error(
          { userId: principal.userId, reason: error instanceof Error ? error.name : 'unknown' },
          'could not send the verification email',
        );
        throw new ApiError(
          502,
          'EMAIL_NOT_SENT',
          'We could not send the email just now. Please try again in a minute.',
        );
      }
    },

    /**
     * Uses a verification link: marks the person's email as verified and records it in the activity log. The link works
     * once, and only until it expires. An unknown, used or expired link all get the same answer.
     */
    async verify(token: string): Promise<void> {
      await database.runInSystemTransaction(async (transaction) => {
        const usedLink = await authTokensRepository.useAuthToken(transaction, hashSecret(token), 'verify_email');
        if (!usedLink) {
          throw new ApiError(
            400,
            'INVALID_TOKEN',
            'This link is not valid any more. Ask for a new email and try again.',
          );
        }
        const business = await usersRepository.markEmailVerified(transaction, usedLink.userId);
        if (!business) throw notFound('Your account');
        await writeActivityLog(transaction, {
          accountId: business.accountId,
          actor: { kind: 'user', id: usedLink.userId },
          kind: 'auth.email_verified',
          details: { recordType: 'user', recordId: usedLink.userId },
        });
      });
    },
  };
}

export type EmailVerificationService = ReturnType<typeof createEmailVerificationService>;
