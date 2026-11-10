import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import { ROUTE_LIMITS } from '../src/kernel/http/route-limits';
import { buildTestApp, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let relaxedApp: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  relaxedApp = await buildTestApp(database);
});
afterAll(async () => {
  await relaxedApp.close();
  await database.close();
});

/** Calls a route `times` times from the same address and returns the status codes. */
async function callRepeatedly(
  testApp: FastifyInstance,
  times: number,
  makeRequest: (attempt: number) => { url: string; payload?: object; cookie?: string },
) {
  const statusCodes: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) {
    const { url, payload, cookie } = makeRequest(attempt);
    const response = await testApp.inject({
      method: 'POST',
      url,
      headers: { ...unsafeRequestHeaders, ...(cookie ? { cookie } : {}) },
      ...(payload ? { payload } : {}),
    });
    statusCodes.push(response.statusCode);
  }
  return statusCodes;
}

/** The list of status codes if the route allows `max` calls and refuses the rest: max times "not 429", then 429. */
const firstRefusedCall = (statusCodes: number[]) => statusCodes.findIndex((statusCode) => statusCode === 429) + 1;

describe('per-address limits on the open routes', () => {
  it('login: the 11th try in a minute is refused with 429', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const statusCodes = await callRepeatedly(strictApp, ROUTE_LIMITS.login.max + 2, () => ({
      url: '/api/v1/auth/login',
      payload: { email: `nobody-${randomUUID().slice(0, 8)}@example.com`, password: 'wrong-password-here' },
    }));
    expect(firstRefusedCall(statusCodes)).toBe(ROUTE_LIMITS.login.max + 1);
    expect(statusCodes.slice(0, ROUTE_LIMITS.login.max).every((statusCode) => statusCode === 401)).toBe(true);
    await strictApp.close();
  });

  it('sign-up: the 11th in an hour is refused with 429', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    // An empty body is refused with 400, but every call still counts towards the limit
    const statusCodes = await callRepeatedly(strictApp, ROUTE_LIMITS.signUp.max + 1, () => ({
      url: '/api/v1/auth/signup',
      payload: {},
    }));
    expect(firstRefusedCall(statusCodes)).toBe(ROUTE_LIMITS.signUp.max + 1);
    await strictApp.close();
  });

  it('verify-email: the 21st in a minute is refused with 429', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const statusCodes = await callRepeatedly(strictApp, ROUTE_LIMITS.verifyEmail.max + 1, () => ({
      url: '/api/v1/auth/verify-email',
      payload: { token: 'x'.repeat(43) },
    }));
    expect(firstRefusedCall(statusCodes)).toBe(ROUTE_LIMITS.verifyEmail.max + 1);
    await strictApp.close();
  });

  it('refresh: the 31st in a minute is refused with 429', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const statusCodes = await callRepeatedly(strictApp, ROUTE_LIMITS.refresh.max + 1, () => ({
      url: '/api/v1/auth/refresh',
    }));
    expect(firstRefusedCall(statusCodes)).toBe(ROUTE_LIMITS.refresh.max + 1);
    await strictApp.close();
  });

  it('resend-email: the 4th in ten minutes is refused with 429, so the mail server cannot be flooded', async () => {
    const person = await createSignedInPerson(relaxedApp, database, { verified: false });
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const statusCodes = await callRepeatedly(strictApp, ROUTE_LIMITS.resendEmail.max + 1, () => ({
      url: '/api/v1/auth/resend-email',
      cookie: person.cookieHeader,
    }));
    expect(statusCodes).toEqual([200, 200, 200, 429]);
    await strictApp.close();
  });

  it('each route has its own count: using up login does not block refresh or sign-up', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    await callRepeatedly(strictApp, ROUTE_LIMITS.login.max + 1, () => ({
      url: '/api/v1/auth/login',
      payload: { email: `nobody-${randomUUID().slice(0, 8)}@example.com`, password: 'wrong-password-here' },
    }));
    const refreshAfter = await callRepeatedly(strictApp, 1, () => ({ url: '/api/v1/auth/refresh' }));
    const signUpAfter = await callRepeatedly(strictApp, 1, () => ({ url: '/api/v1/auth/signup', payload: {} }));
    expect(refreshAfter).toEqual([401]);
    expect(signUpAfter).toEqual([400]);
    await strictApp.close();
  });

  it('the 429 answer has the standard error shape', async () => {
    const strictApp = await buildTestApp(database, [], { strictRouteLimits: true });
    const send = () => strictApp.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: unsafeRequestHeaders });
    for (let attempt = 0; attempt < ROUTE_LIMITS.refresh.max; attempt += 1) await send();
    const refused = await send();
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error.code).toBe('TOO_MANY_REQUESTS');
    await strictApp.close();
  });
});
