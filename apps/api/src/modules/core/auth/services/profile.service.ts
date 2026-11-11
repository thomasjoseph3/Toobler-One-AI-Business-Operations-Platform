import type { ProfileResponse, UpdateProfileRequest } from '@toobler-one/shared';
import { writeActivityLog } from '../../../../kernel/activity-log';
import type { Database } from '../../../../kernel/database';
import { ApiError, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import * as accountsRepository from '../repositories/accounts.repository';
import * as usersRepository from '../repositories/users.repository';
import { normaliseMobile } from '../helpers/phone';

// The country code added to a mobile number typed without one (91 = India), as at sign-up.
const DEFAULT_COUNTRY_CODE = '91';

/**
 * Everything about the signed-in person's own profile. The route calls this.
 * Repositories used: accounts, users (both in ../repositories).
 */
export function createProfileService({ database }: { database: Database }) {
  return {
    /**
     * The signed-in person and their business. It reads inside that business's fence, so it could not see anyone else's
     * data even if a query forgot its own filter.
     */
    async getProfile(principal: Pick<Principal, 'accountId' | 'userId'>): Promise<ProfileResponse> {
      const { person, business } = await database.runInAccountTransaction(principal.accountId, async (transaction) => ({
        person: await usersRepository.findPersonProfileById(transaction, principal.userId),
        business: await accountsRepository.findAccountById(transaction, principal.accountId),
      }));
      if (!person || !business) throw notFound('Your account');
      return { user: person, business };
    },

    /**
     * Changes the signed-in person's own name and/or mobile number, and answers with the updated profile. It works inside
     * the business's fence and only ever touches the person making the request.
     */
    async updateProfile(
      principal: Pick<Principal, 'accountId' | 'userId'>,
      request: UpdateProfileRequest,
    ): Promise<ProfileResponse> {
      let mobile: ReturnType<typeof normaliseMobile> = null;
      if (request.mobile !== undefined) {
        mobile = normaliseMobile(request.mobile, DEFAULT_COUNTRY_CODE);
        if (!mobile) throw new ApiError(400, 'INVALID_MOBILE', 'Enter a valid mobile number, like +91 98470 12345.');
      }
      const { person, business } = await database.runInAccountTransaction(principal.accountId, async (transaction) => {
        const changed = await usersRepository.updateOwnDetails(transaction, principal.userId, {
          ...(request.name !== undefined ? { name: request.name } : {}),
          ...(mobile ? { mobileE164: mobile.e164, mobileKey: mobile.key } : {}),
        });
        if (!changed) throw notFound('Your account');
        await writeActivityLog(transaction, {
          accountId: principal.accountId,
          actor: { kind: 'user', id: principal.userId },
          kind: 'auth.profile_updated',
          // Only which fields changed, never their values
          details: { recordType: 'user', recordId: principal.userId, fields: Object.keys(request) },
        });
        return {
          person: await usersRepository.findPersonProfileById(transaction, principal.userId),
          business: await accountsRepository.findAccountById(transaction, principal.accountId),
        };
      });
      if (!person || !business) throw notFound('Your account');
      return { user: person, business };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
