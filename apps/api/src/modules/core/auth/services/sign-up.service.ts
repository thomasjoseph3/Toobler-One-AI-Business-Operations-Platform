import type { ProfileResponse, SignUpRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Database } from '../../../../kernel/database';
import { ApiError, conflict } from '../../../../kernel/errors';
import { uuidv7 } from '../../../../kernel/ids';
import { isActiveIndustry } from '../../industries';
import { grantStartingModules } from '../../module-switches';
import type { EmailVerificationService } from './email-verification.service';
import * as accountsRepository from '../repositories/accounts.repository';
import * as credentialsRepository from '../repositories/credentials.repository';
import * as usersRepository from '../repositories/users.repository';
import { normaliseMobile } from '../helpers/phone';
import { findPasswordProblem, hashPassword } from '../helpers/passwords';

// The country code added to a mobile number typed without one (91 = India). It becomes a setting in a later slice.
const DEFAULT_COUNTRY_CODE = '91';

/**
 * Everything about signing up. The route calls this.
 * Repositories used: accounts, users, credentials (all in ../repositories). Emails the verification link through the
 * email-verification service.
 */
export function createSignUpService({
  database,
  emailVerificationService,
}: {
  database: Database;
  emailVerificationService: EmailVerificationService;
}) {
  return {
    /**
     * Creates a business and its owner (a manager), and stores the owner's password as a hash. Nothing is signed in yet:
     * sessions and cookies arrive in the next slice. One email manages one business, so an email that is already
     * registered is refused.
     */
    async signUp(request: SignUpRequest): Promise<ProfileResponse> {
      // The industry must be one on the list (GET /api/v1/industries). Checked first because it is the cheapest check.
      if (!(await isActiveIndustry(database, request.industry))) {
        throw new ApiError(400, 'INVALID_INDUSTRY', 'Choose one of the industries on the list.');
      }

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
          // The new business starts with its starting modules switched on
          await grantStartingModules(transaction, accountId, userId);
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

      // After the business is saved: email the verification link. A mail failure does not undo the sign-up.
      await emailVerificationService.sendAfterSignUp(userId);

      return {
        user: {
          id: userId,
          name: request.name,
          email: request.email,
          mobile: mobile.e164,
          role: 'manager',
          emailVerified: false,
        },
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
