import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import type { MailboxAccess } from '../../../../providers/mailbox';
import { decryptSecret } from '../../../core/ai';
import * as emailConnectionRepository from '../repositories/email-connection.repository';
import type { EmailConnectionRow } from '../repositories/email-connection.repository';

/**
 * The business's mailbox login, with the password unscrambled, together with its saved settings. Undefined when no mailbox is connected or
 * the server has no secret to unscramble with. The password only ever lives in memory for the length of one call.
 */
export async function openMailboxAccess(
  database: Database,
  config: Config,
  accountId: string,
): Promise<{ access: MailboxAccess; connection: EmailConnectionRow } | undefined> {
  const secretKey = config.secrets.encryptionKey;
  if (!secretKey) return undefined;
  const stored = await database.runInAccountTransaction(accountId, (transaction) =>
    emailConnectionRepository.findConnectionWithPassword(transaction, accountId),
  );
  if (!stored) return undefined;
  return {
    connection: stored,
    access: {
      address: stored.address,
      username: stored.username,
      password: decryptSecret(stored.encryptedPassword, secretKey, accountId),
      imapHost: stored.imapHost,
      imapPort: stored.imapPort,
      smtpHost: stored.smtpHost,
      smtpPort: stored.smtpPort,
    },
  };
}
