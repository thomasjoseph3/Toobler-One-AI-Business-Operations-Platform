import type { ProfileResponse } from '@toobler-one/shared';
import type { Database } from '../../../../kernel/database';
import { notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import * as accountsRepository from '../data/accounts.repository';
import * as usersRepository from '../data/users.repository';

/** Everything about the signed-in person's own profile. The route calls this; this calls the repositories in ../data. */
export function createProfileService({ database }: { database: Database }) {
  return {
    /**
     * The signed-in person and their business. It reads inside that business's fence, so it could not see anyone else's
     * data even if a query forgot its own filter.
     */
    async getProfile(principal: Principal): Promise<ProfileResponse> {
      const { person, business } = await database.runInAccountTransaction(principal.accountId, async (transaction) => ({
        person: await usersRepository.findPersonProfileById(transaction, principal.userId),
        business: await accountsRepository.findAccountById(transaction, principal.accountId),
      }));
      if (!person || !business) throw notFound('Your account');
      return { user: person, business };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
