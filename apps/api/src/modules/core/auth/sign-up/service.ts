import type { ProfileResponse, SignUpRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import * as accountsRepository from '../data/accounts.repository';
import * as credentialsRepository from '../data/credentials.repository';
import * as usersRepository from '../data/users.repository';
import { normaliseMobile } from '../helpers/phone';
import { findPasswordProblem, hashPassword } from '../password/passwords';

// The country code added to a mobile number typed without one (91 = India). It becomes a setting in a later slice.
const DEFAULT_COUNTRY_CODE = '91';

/** Everything about signing up. The route calls this; this calls the repositories in ../data. */
export function createSignUpService({ database }: { database: Database }) {
  return {
    /**
     * Creates a business and its owner (a manager), and stores the owner's password as a hash. Nothing is signed in yet:
     * sessions and cookies arrive in the next slice. One email manages one business, so an email that is already
     * registered is refused.
     */
    async signUp(request: SignUpRequest): Promise<ProfileResponse> {
      const mobile = normaliseMobile(request.mobile, DEFAULT_COUNTRY_CODE);
      if (!mobile) throw new ApiError(400, 'INVALID_MOBILE', 'Enter a valid mobile number, like +91 98470 12345.');

      const passwordProblem = findPasswordProblem(request.password, {
        email: request.email,
        mobileDigits: mobile.e164.replace(/\D/g, ''),
      });
      if (passwordProblem) throw new ApiError(400, 'WEAK_PASSWORD', passwordProblem);

      const passwordHash = await hashPassword(request.password);
      const accountId = uuidv7();
      const userId = uuidv7();
      const emailTakenError = () =>
        conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in instead.');

      try {
        // One transaction: either the business, the owner and the password are all saved, or none of them are.
        await database.runInSystemTransaction(async (transaction) => {
          if (await usersRepository.emailIsRegistered(transaction, request.email)) throw emailTakenError();
          await accountsRepository.insertAccount(transaction, {
            id: accountId,
            name: request.businessName,
            industry: request.industry,
          });
          await usersRepository.insertUser(transaction, {
            id: userId,
            accountId,
            email: request.email,
            name: request.name,
            mobileE164: mobile.e164,
            mobileKey: mobile.key,
            role: 'manager',
            createdBy: { kind: 'user', id: userId },
          });
          await credentialsRepository.insertCredentials(transaction, userId, passwordHash);
          await writeActivityLog(transaction, {
            accountId,
            actor: { kind: 'user', id: userId },
            kind: 'auth.signed_up',
            details: { recordType: 'user', recordId: userId },
          });
        });
      } catch (error) {
        // Two sign-ups with the same email at the same moment: the database's unique index decides who wins.
        if (error instanceof Error && 'code' in error && error.code === '23505') throw emailTakenError();
        throw error;
      }

      return {
        user: { id: userId, name: request.name, email: request.email, mobile: mobile.e164, role: 'manager' },
        business: {
          id: accountId,
          name: request.businessName,
          industry: request.industry,
          timeZone: 'Asia/Kolkata',
        },
      };
    },
  };
}

export type SignUpService = ReturnType<typeof createSignUpService>;
