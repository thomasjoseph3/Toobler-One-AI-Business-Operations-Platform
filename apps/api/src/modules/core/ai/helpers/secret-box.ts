import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// Keeps a secret (like an AI key) safe in the database. AES-256-GCM: the text is scrambled with the server's secret, and a tag
// makes any change to the stored value detectable. The business's id is mixed in as "extra data", so a stored key copied
// into another business's row cannot be read. Built into Node: no package. Pure: no database, no settings of its own.

const FORMAT_VERSION = 'v1';
const INITIALISATION_VECTOR_BYTES = 12; // the size AES-GCM is designed for

/** Scrambles `plainText`. The result looks like `v1.<iv>.<tag>.<scrambled>` and is safe to store. */
export function encryptSecret(plainText: string, secretKey: Buffer, accountId: string): string {
  const initialisationVector = randomBytes(INITIALISATION_VECTOR_BYTES);
  const cipher = createCipheriv('aes-256-gcm', secretKey, initialisationVector);
  cipher.setAAD(Buffer.from(accountId));
  const scrambled = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    initialisationVector.toString('base64url'),
    authenticationTag.toString('base64url'),
    scrambled.toString('base64url'),
  ].join('.');
}

/** Unscrambles a stored value. Throws when it was changed, is for another business, or was made with another secret. */
export function decryptSecret(stored: string, secretKey: Buffer, accountId: string): string {
  const [version, initialisationVectorText, tagText, scrambledText] = stored.split('.');
  if (version !== FORMAT_VERSION || !initialisationVectorText || !tagText || !scrambledText) {
    throw new Error('The stored secret is not in a format this server understands');
  }
  const decipher = createDecipheriv('aes-256-gcm', secretKey, Buffer.from(initialisationVectorText, 'base64url'));
  decipher.setAAD(Buffer.from(accountId));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plainBytes = Buffer.concat([decipher.update(Buffer.from(scrambledText, 'base64url')), decipher.final()]);
  return plainBytes.toString('utf8');
}

/**
 * A fingerprint of a secret: a keyed hash, the same secret always gives the same 64 characters. Used to spot the same key being
 * saved twice without keeping anything that could be turned back into the key.
 */
export function fingerprintSecret(plainText: string, secretKey: Buffer, scope: string): string {
  return createHmac('sha256', secretKey).update(`${scope}:${plainText}`).digest('hex');
}

/** The last four characters, for showing a key as "••••3f9a". */
export function lastFourCharacters(plainText: string): string {
  return plainText.slice(-4);
}
