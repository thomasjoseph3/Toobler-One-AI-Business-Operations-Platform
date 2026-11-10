import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/kernel/database';
import * as loginAttemptsRepository from '../src/modules/core/auth/repositories/login-attempts.repository';
import { buildTestApp, captureLogs, unsafeRequestHeaders } from './support/app';
import { createSignedInPerson, TEST_PASSWORD } from './support/auth';
import { openTestDatabase } from './support/harness';

let database: Database;
let app: FastifyInstance;

beforeAll(async () => {
  database = openTestDatabase();
  app = await buildTestApp(database);
});
afterAll(async () => {
  await app.close();
  await database.close();
});

const signIn = (email: string, password: string, testApp: FastifyInstance = app) =>
  testApp.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: unsafeRequestHeaders,
    payload: { email, password },
  });

/** Types the wrong password this many times for the email. */
async function typeWrongPassword(email: string, times: number) {
  for (let attempt = 0; attempt < times; attempt += 1) await signIn(email, 'not-the-right-password');
}

const attemptsFor = (email: string) =>
  database.system.selectFrom('login_attempts').selectAll().where('email', '=', email).executeTakeFirst();

const unknownEmail = () => `nobody-${randomUUID().slice(0, 8)}@example.com`;

describe('lockout after wrong passwords', () => {
  it('locks on the 6th try after 5 wrong passwords, even if that try has the right password', async () => {
    const person = await createSignedInPerson(app, database);
    await typeWrongPassword(person.email, 4);
    const fifth = await signIn(person.email, 'not-the-right-password');
    expect(fifth.statusCode).toBe(401); // the 5th is still "not right"; it is what locks

    const sixth = await signIn(person.email, TEST_PASSWORD);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(sixth.cookies).toEqual([]); // nothing was signed in
    const row = await attemptsFor(person.email);
    expect(row?.locked_until).not.toBeNull();
    const minutesLocked = (row!.locked_until!.getTime() - Date.now()) / 60_000;
    expect(minutesLocked).toBeGreaterThan(14);
    expect(minutesLocked).toBeLessThanOrEqual(15);
  });

  it('locks an email that has no account in exactly the same way, with the same answer', async () => {
    const person = await createSignedInPerson(app, database);
    const nobody = unknownEmail();
    await typeWrongPassword(person.email, 5);
    await typeWrongPassword(nobody, 5);
    const lockedKnown = await signIn(person.email, 'x-wrong-again');
    const lockedUnknown = await signIn(nobody, 'x-wrong-again');
    expect(lockedKnown.statusCode).toBe(429);
    expect(lockedUnknown.statusCode).toBe(429);
    expect(lockedKnown.json()).toEqual(lockedUnknown.json());
  });

  it('does not extend the lock when more tries arrive during it', async () => {
    const person = await createSignedInPerson(app, database);
    await typeWrongPassword(person.email, 5);
    const before = (await attemptsFor(person.email))!.locked_until!.getTime();
    await typeWrongPassword(person.email, 3);
    const after = (await attemptsFor(person.email))!.locked_until!.getTime();
    expect(after).toBe(before);
  });

  it('forgets the wrong passwords after a good sign-in, so the count starts again', async () => {
    const person = await createSignedInPerson(app, database);
    await typeWrongPassword(person.email, 4);
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
    expect(await attemptsFor(person.email)).toBeUndefined();
    await typeWrongPassword(person.email, 4); // 4 more is still not a lock
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
  });

  it('lets the person in again once the 15 minutes are over', async () => {
    const person = await createSignedInPerson(app, database);
    await typeWrongPassword(person.email, 5);
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(429);
    await database.system
      .updateTable('login_attempts')
      .set({ locked_until: new Date(Date.now() - 1000), window_started_at: new Date(Date.now() - 20 * 60_000) })
      .where('email', '=', person.email)
      .execute();
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
  });

  it('starts counting again when the first wrong password is more than 15 minutes old', async () => {
    const person = await createSignedInPerson(app, database);
    await typeWrongPassword(person.email, 4);
    await database.system
      .updateTable('login_attempts')
      .set({ window_started_at: new Date(Date.now() - 20 * 60_000) })
      .where('email', '=', person.email)
      .execute();
    await typeWrongPassword(person.email, 1); // would have been the 5th, but the count restarted
    expect((await attemptsFor(person.email))?.failed_count).toBe(1);
    expect((await signIn(person.email, TEST_PASSWORD)).statusCode).toBe(200);
  });

  it('counts each email on its own', async () => {
    const first = await createSignedInPerson(app, database);
    const second = await createSignedInPerson(app, database);
    await typeWrongPassword(first.email, 5);
    expect((await signIn(first.email, TEST_PASSWORD)).statusCode).toBe(429);
    expect((await signIn(second.email, TEST_PASSWORD)).statusCode).toBe(200);
  });

  it('counts simultaneous wrong tries exactly (none are lost)', async () => {
    const email = unknownEmail();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        loginAttemptsRepository.recordFailure(database.system, email, {
          maxFailures: 5,
          windowMinutes: 15,
          lockMinutes: 15,
        }),
      ),
    );
    const row = await attemptsFor(email);
    expect(row?.failed_count).toBe(8);
    expect(row?.locked_until).not.toBeNull();
  });

  it('keeps the email out of the log', async () => {
    const { logger, text } = captureLogs();
    const loggingApp = await buildTestApp(database, [], { logger });
    const email = unknownEmail();
    for (let attempt = 0; attempt < 6; attempt += 1) await signIn(email, 'wrong-password-here', loggingApp);
    expect(text()).toContain('/api/v1/auth/login');
    expect(text()).not.toContain(email);
    await loggingApp.close();
  });
});
