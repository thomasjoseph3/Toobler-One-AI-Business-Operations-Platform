import { randomBytes } from 'node:crypto';

/**
 * Creates a new id as a UUID version 7: the first 48 bits are the creation time in milliseconds, so ids made later sort
 * after ids made earlier and new rows land at the end of the database index. Returns the id as a text string.
 */
export function uuidv7(timestampInMilliseconds = Date.now()): string {
  const uuidBytes = randomBytes(16);
  // Bytes 0 to 5 hold the timestamp, most significant byte first.
  uuidBytes[0] = (timestampInMilliseconds / 2 ** 40) & 0xff;
  uuidBytes[1] = (timestampInMilliseconds / 2 ** 32) & 0xff;
  uuidBytes[2] = (timestampInMilliseconds / 2 ** 24) & 0xff;
  uuidBytes[3] = (timestampInMilliseconds / 2 ** 16) & 0xff;
  uuidBytes[4] = (timestampInMilliseconds / 2 ** 8) & 0xff;
  uuidBytes[5] = timestampInMilliseconds & 0xff;
  uuidBytes[6] = (uuidBytes[6]! & 0x0f) | 0x70; // marks the id as version 7
  uuidBytes[8] = (uuidBytes[8]! & 0x3f) | 0x80; // marks the id as the standard UUID variant
  const hexadecimalText = uuidBytes.toString('hex');
  return [
    hexadecimalText.slice(0, 8),
    hexadecimalText.slice(8, 12),
    hexadecimalText.slice(12, 16),
    hexadecimalText.slice(16, 20),
    hexadecimalText.slice(20),
  ].join('-');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Says whether a value is a text string shaped like a UUID. Checked before querying, so a bad id is "not found", not a 500. */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
