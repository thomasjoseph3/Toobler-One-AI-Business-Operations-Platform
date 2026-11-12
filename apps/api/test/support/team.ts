import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Database } from '../../src/kernel/database';
import { hashPassword } from '../../src/modules/core/auth/helpers/passwords';
import { createSignedInPerson, TEST_PASSWORD } from './auth';
import { createPretendBrowser, type PretendBrowser } from './browser';

// Real people for journey tests. Each one has their own session, their own cookies and their own role, exactly as in the
// product: they sign in through the real sign-in route, and every request they make goes through the real guard.
//
// The business owner signs up through the real sign-up route. The other team members are added straight to the database,
// because the invitation route arrives with the team feature (F02); once it exists, `addTeamMember` is the one place to
// change so that it invites them instead.

export type TeamRole = 'manager' | 'staff' | 'staff_own';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** One person of a business, signed in. */
export interface TeamMember {
  name: string;
  email: string;
  userId: string;
  businessId: string;
  role: TeamRole;
  browser: PretendBrowser;
  /** Sends a request as this person and returns the raw response. */
  send(method: HttpMethod, url: string, payload?: object): Promise<Awaited<ReturnType<PretendBrowser['send']>>>;
  /** Sends a request as this person, checks it answered with `status`, and returns the body (nothing for 204). */
  ok(method: HttpMethod, url: string, payload?: object, status?: number): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Sends a request that must be refused with `status`, and returns the error code. */
  refused(method: HttpMethod, url: string, payload: object | undefined, status: number): Promise<string>;
}

/** Wraps a person's browser in the helpers above. Addresses start after /api/v1. */
function makeTeamMember(
  details: Pick<TeamMember, 'name' | 'email' | 'userId' | 'businessId' | 'role' | 'browser'>,
): TeamMember {
  const member: TeamMember = {
    ...details,
    send: (method, url, payload) => details.browser.send(method, `/api/v1${url}`, payload),
    async ok(method, url, payload, status = 200) {
      const response = await member.send(method, url, payload);
      expect(response.statusCode, `${details.name}: ${method} ${url} -> ${response.body}`).toBe(status);
      return status === 204 ? undefined : response.json();
    },
    async refused(method, url, payload, status) {
      const response = await member.send(method, url, payload);
      expect(response.statusCode, `${details.name}: ${method} ${url} -> ${response.body}`).toBe(status);
      return (response.json()?.error?.code as string | undefined) ?? '';
    },
  };
  return member;
}

/** A new business owner (a manager), signed up and signed in through the real routes, verified. */
export async function signUpOwner(app: FastifyInstance, database: Database): Promise<TeamMember> {
  const signedIn = await createSignedInPerson(app, database);
  const browser = createPretendBrowser(app);
  browser.setCookie('toobler_access', signedIn.cookieHeader.replace('toobler_access=', ''));
  return makeTeamMember({
    name: 'Anita Nair',
    email: signedIn.email,
    userId: signedIn.profile.user.id,
    businessId: signedIn.profile.business.id,
    role: 'manager',
    browser,
  });
}

/**
 * Adds a person to the owner's business with a role and a password, then signs them in through the real sign-in route so they
 * have their own session. They are verified, so they can work straight away.
 */
export async function addTeamMember(
  app: FastifyInstance,
  database: Database,
  owner: Pick<TeamMember, 'businessId'>,
  options: { name: string; role: TeamRole },
): Promise<TeamMember> {
  const userId = randomUUID();
  const email = `${options.name.toLowerCase().replace(/[^a-z]/g, '')}-${userId.slice(0, 8)}@example.com`;
  await database.system
    .insertInto('users')
    .values({
      id: userId,
      account_id: owner.businessId,
      email,
      name: options.name,
      mobile_e164: null,
      mobile_key: null,
      role: options.role,
      email_verified_at: new Date(),
    })
    .execute();
  await database.system
    .insertInto('user_credentials')
    .values({ user_id: userId, password_hash: await hashPassword(TEST_PASSWORD) })
    .execute();

  const browser = createPretendBrowser(app);
  const login = await browser.send('POST', '/api/v1/auth/login', { email, password: TEST_PASSWORD });
  expect(login.statusCode, `${options.name} signing in: ${login.body}`).toBe(200);
  expect(login.json().user.role).toBe(options.role);
  return makeTeamMember({
    name: options.name,
    email,
    userId,
    businessId: owner.businessId,
    role: options.role,
    browser,
  });
}

/** A phone number nobody else uses: a UAE mobile with random digits. */
export const uniqueUaeNumber = () => `+9715${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
