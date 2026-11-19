import type { FastifyBaseLogger } from 'fastify';
import type { AccountContext } from '../../../../kernel/context';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import type { WhatsappProvider } from '../../../../providers/whatsapp';
import { decryptSecret } from '../../../core/ai';
import { createConversationRecordsService } from '../../../core/conversations';
import { isWithinReplyWindow, toWhatsAppText } from '../helpers/whatsapp-text';
import * as whatsappConnectionRepository from '../repositories/whatsapp-connection.repository';

/**
 * Sends a team member's reply (saved in the inbox) to the customer on WhatsApp. Runs when the "conversation.message" event for a staff
 * message arrives. Free text is allowed only for 24 hours after the customer's last message (WhatsApp's rule); after that the reply stays
 * in the inbox and the failure is noted on the connection, because only approved templates may be sent (a later step).
 * Safe to run twice for the same event: the worst case is the same reply sent again, so it is kept to one try per event by the caller.
 */
export async function sendStaffReplyOnWhatsapp(input: {
  database: Database;
  config: Config;
  whatsapp: WhatsappProvider;
  accountContext: AccountContext;
  conversationId: string;
  messageId: string;
  logger?: FastifyBaseLogger | undefined;
  now?: Date;
}): Promise<void> {
  const { database, config, whatsapp, accountContext } = input;
  const { accountId } = accountContext;
  const records = createConversationRecordsService({ database });
  const staffMessage = await records.readStaffMessageForDelivery(accountId, input.conversationId, input.messageId);
  if (!staffMessage || staffMessage.channel !== 'whatsapp' || staffMessage.fromPhoneKey === null) return;
  const secretKey = config.secrets.encryptionKey;
  if (!secretKey) return;
  const access = await database.runInAccountTransaction(accountId, (transaction) =>
    whatsappConnectionRepository.findAccessForSending(transaction, accountId),
  );
  if (!access) return;

  /** Notes on the connection why the reply could not go out, so the manager sees it on the WhatsApp screen. */
  const noteFailure = (note: string) =>
    database.runInAccountTransaction(accountId, (transaction) =>
      whatsappConnectionRepository.saveCheckResult(transaction, {
        accountId,
        status: 'failed',
        note,
        displayPhoneNumber: null,
        checkedAt: new Date(),
      }),
    );

  if (!isWithinReplyWindow(staffMessage.lastCustomerMessageAt, input.now ?? new Date())) {
    await noteFailure(
      'A reply was not sent: the customer last wrote more than 24 hours ago, so WhatsApp only allows an approved template.',
    );
    return;
  }
  try {
    await whatsapp.sendText(
      {
        accessToken: decryptSecret(access.encryptedAccessToken, secretKey, accountId),
        phoneNumberId: access.phoneNumberId,
      },
      staffMessage.fromPhoneKey,
      toWhatsAppText(staffMessage.body),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Meta refused the message';
    input.logger?.warn({ accountId, reason }, 'a staff reply could not be sent on WhatsApp');
    await noteFailure(`A reply could not be sent: ${reason}`);
  }
}
