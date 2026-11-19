import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import { findPasswordProblem, hashPassword, passwordMatches } from '../helpers/passwords';
import * as credentialsRepository from '../repositories/credentials.repository';
import * as sessionsRepository from '../repositories/sessions.repository';
import * as usersRepository from '../repositories/users.repository';

/**
 * Changing the password of the person who is signed in. The route calls this.
 * Repositories used: users, credentials, sessions (all in ../repositories).
 */
export function createPasswordService({ database }: { database: Database }) {
  return {
    /**
     * Checks the current password, then saves the new one (as a hash) and ends the person's OTHER sessions, keeping the
     * device they are using. A wrong current password changes nothing. The new password must pass the same rules as at
     * sign-up and must be different from the current one.
     */
    async changePassword(
      principal: Pick<Principal, 'userId' | 'sessionId'>,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      const storedHash = await credentialsRepository.findPasswordHash(database.system, principal.userId);
      const person = await usersRepository.findPersonById(database.system, principal.userId);
      if (!storedHash || !person) throw notFound('Your account');

      if (!(await passwordMatches(storedHash, currentPassword))) {
        throw new ApiError(400, 'WRONG_PASSWORD', 'The current password is not right.');
      }
      if (newPassword === currentPassword) {
        throw new ApiError(400, 'WEAK_PASSWORD', 'Choose a password different from your current one.');
      }
      const passwordProblem = findPasswordProblem(newPassword, {
        email: person.email,
        mobileDigits: person.mobile ? person.mobile.replace(/\D/g, '') : null,
      });
      if (passwordProblem) throw new ApiError(400, 'WEAK_PASSWORD', passwordProblem);

      const newHash = await hashPassword(newPassword);
      await database.runInSystemTransaction(async (transaction) => {
        await credentialsRepository.setPasswordHash(transaction, person.id, newHash);
        await sessionsRepository.revokeAllSessionsForUser(
          transaction,
          person.id,
          'password changed',
          principal.sessionId,
        );
        await writeActivityLog(transaction, {
          accountId: person.accountId,
          actor: { kind: 'user', id: person.id },
          kind: 'auth.password_changed',
          details: { recordType: 'user', recordId: person.id },
        });
      });
    },
  };
}

export type PasswordService = ReturnType<typeof createPasswordService>;
