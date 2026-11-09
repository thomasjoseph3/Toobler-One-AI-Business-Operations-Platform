import { randomBytes } from 'node:crypto';

/** UUID version 7: time-ordered, so new rows land at the end of the index. */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** True for a string that can be a record id. Checked before querying, so a bad id is "not found", not a 500. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
