import { describe, expect, it } from 'vitest';
import { decideKeySources } from './decide-key-sources';

const now = new Date('2026-11-13T10:00:00Z');
const past = new Date('2026-11-01T00:00:00Z');
const future = new Date('2026-12-01T00:00:00Z');

describe('decideKeySources', () => {
  it('own: only the business’s own keys, whatever the platform allows', () => {
    expect(
      decideKeySources({
        keyMode: 'own',
        platformEnabled: true,
        platformExpiresAt: null,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }),
    ).toEqual({
      useOwn: true,
      usePlatform: false,
      platformBlockedBecause: null,
    });
  });

  it('platform: the platform’s keys only while switched on', () => {
    expect(
      decideKeySources({
        keyMode: 'platform',
        platformEnabled: true,
        platformExpiresAt: null,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }),
    ).toEqual({
      useOwn: false,
      usePlatform: true,
      platformBlockedBecause: null,
    });
    expect(
      decideKeySources({
        keyMode: 'platform',
        platformEnabled: false,
        platformExpiresAt: null,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }),
    ).toEqual({
      useOwn: false,
      usePlatform: false,
      platformBlockedBecause: 'not_enabled',
    });
  });

  it('platform: stops at the end date, and works before it', () => {
    expect(
      decideKeySources({
        keyMode: 'platform',
        platformEnabled: true,
        platformExpiresAt: past,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }),
    ).toMatchObject({
      usePlatform: false,
      platformBlockedBecause: 'ended',
    });
    expect(
      decideKeySources({
        keyMode: 'platform',
        platformEnabled: true,
        platformExpiresAt: future,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }).usePlatform,
    ).toBe(true);
    // the very moment of the end date counts as ended
    expect(
      decideKeySources({
        keyMode: 'platform',
        platformEnabled: true,
        platformExpiresAt: now,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }).usePlatform,
    ).toBe(false);
  });

  it('own_then_platform: own keys always, the platform’s only when allowed', () => {
    expect(
      decideKeySources({
        keyMode: 'own_then_platform',
        platformEnabled: true,
        platformExpiresAt: null,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }),
    ).toEqual({
      useOwn: true,
      usePlatform: true,
      platformBlockedBecause: null,
    });
    expect(
      decideKeySources({
        keyMode: 'own_then_platform',
        platformEnabled: false,
        platformExpiresAt: null,
        platformMonthlyCallCap: null,
        platformCallsThisMonth: 0,
        now,
      }),
    ).toEqual({
      useOwn: true,
      usePlatform: false,
      platformBlockedBecause: 'not_enabled',
    });
  });

  it('stops the platform’s keys when this month’s cap is used up, and not before', () => {
    const base = {
      keyMode: 'platform' as const,
      platformEnabled: true,
      platformExpiresAt: null,
      platformMonthlyCallCap: 100,
      now,
    };
    expect(decideKeySources({ ...base, platformCallsThisMonth: 99 }).usePlatform).toBe(true);
    expect(decideKeySources({ ...base, platformCallsThisMonth: 100 })).toMatchObject({
      usePlatform: false,
      platformBlockedBecause: 'cap_reached',
    });
    expect(decideKeySources({ ...base, platformCallsThisMonth: 5000 }).usePlatform).toBe(false);
    // a cap of zero means none at all; no cap (null) means no limit
    expect(decideKeySources({ ...base, platformMonthlyCallCap: 0, platformCallsThisMonth: 0 }).usePlatform).toBe(false);
    expect(decideKeySources({ ...base, platformMonthlyCallCap: null, platformCallsThisMonth: 5000 }).usePlatform).toBe(
      true,
    );
  });

  it('keeps own keys going in own_then_platform when the cap is reached', () => {
    expect(
      decideKeySources({
        keyMode: 'own_then_platform',
        platformEnabled: true,
        platformExpiresAt: null,
        platformMonthlyCallCap: 10,
        platformCallsThisMonth: 10,
        now,
      }),
    ).toEqual({ useOwn: true, usePlatform: false, platformBlockedBecause: 'cap_reached' });
  });
});
