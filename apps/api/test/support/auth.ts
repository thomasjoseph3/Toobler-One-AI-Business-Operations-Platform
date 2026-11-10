import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Database } from '../../src/kernel/database';
import { unsafeRequestHeaders } from './app';

/** The password every test person uses. */
export const TEST_PASSWORD = 'river-lamp-kettle-42';

/** A person who has signed up and signed in through the real routes, ready to make requests as themselves. */
export interface SignedInPerson {
  email: string;
  /** The value to send in the `cookie` header: their access cookie, as a browser would send it. */
  cookieHeader: string;
  profile: { user: { id: string; emailVerified: boolean }; business: { id: string } };
}

/**
 * Signs a new owner up and in through the real routes. `isPlatformAdmin` switches the platform admin flag on in the
 * database first, the way the owner will do it with one line of SQL (there is no API for it, on purpose). The person's
 * email is marked verified (what the verify-email link does) unless `verified: false`, so tests of other features are not
 * blocked by the "verify your email first" rule.
 */
export async function createSignedInPerson(
  app: FastifyInstance,
  database: Database,
  options: { isPlatformAdmin?: boolean; verified?: boolean } = {},
): Promise<SignedInPerson> {
  const email = `person-${randomUUID().slice(0, 8)}@example.com`;
  const signUp = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    headers: unsafeRequestHeaders,
    payload: {
      name: 'Anita Nair',
      businessName: `Nair Stays ${randomUUID().slice(0, 6)}`,
      email,
      mobile: '+91 98470 12345',
      password: TEST_PASSWORD,
      industry: 'hotel_resort',
    },
  });
  expect(signUp.statusCode, signUp.body).toBe(201);
  const signUpProfile = signUp.json();

  if (options.isPlatformAdmin) {
    await database.system
      .updateTable('users')
      .set({ is_platform_admin: true })
      .where('id', '=', signUpProfile.user.id)
      .execute();
  }
  if (options.verified !== false) {
    await database.system
      .updateTable('users')
      .set({ email_verified_at: new Date() })
      .where('id', '=', signUpProfile.user.id)
      .execute();
  }

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: unsafeRequestHeaders,
    payload: { email, password: TEST_PASSWORD },
  });
  expect(login.statusCode, login.body).toBe(200);
  const accessCookie = login.cookies.find((cookie) => cookie.name === 'toobler_access');
  // The profile is the one sign-in gave, so it shows the person's current state (verified or not)
  return { email, cookieHeader: `toobler_access=${accessCookie!.value}`, profile: login.json() };
}
