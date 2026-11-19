import { createHmac, timingSafeEqual } from 'node:crypto';

// Checks that a message really came from Meta. Meta signs the exact bytes it sends with our app's secret and puts the result in the
// `X-Hub-Signature-256` header as `sha256=<64 hex characters>`. Pure: no database, no settings of its own.

/** Whether `signatureHeader` is the right signature of `rawBody` for `appSecret`. False for a missing, malformed or wrong signature. */
export function isMetaSignatureValid(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader ?? '');
  if (!match || !match[1] || appSecret === '') return false;
  const expectedSignature = createHmac('sha256', appSecret).update(rawBody).digest();
  const givenSignature = Buffer.from(match[1], 'hex');
  return timingSafeEqual(givenSignature, expectedSignature);
}

/** Makes the header Meta would send for this body. Used by tests (and by nothing else). */
export function signLikeMeta(rawBody: Buffer, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

/** Whether Meta's one-time check of the webhook address brought our verify token (compared without leaking how much matched). */
export function isVerifyTokenCorrect(givenToken: string | undefined, expectedToken: string): boolean {
  if (givenToken === undefined || expectedToken === '') return false;
  const given = Buffer.from(givenToken);
  const expected = Buffer.from(expectedToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
