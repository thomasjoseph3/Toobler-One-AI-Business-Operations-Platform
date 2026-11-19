import type { FastifyBaseLogger } from 'fastify';
import type { Actor } from '../../../../kernel/context';
import type { Config } from '../../../../kernel/config';
import type { Database } from '../../../../kernel/database';
import { ApiError } from '../../../../kernel/errors';
import type { ModuleGate } from '../../../../kernel/module-system/registry';
import type { WhatsappAccess, WhatsappProvider } from '../../../../providers/whatsapp';
import type { createAgentSavedTurnService } from '../../../core/agents';
import { decryptSecret } from '../../../core/ai';
import { findBusinessLiveAt } from '../../../core/auth';
import { createConversationRecordsService } from '../../../core/conversations';
import type { IncomingWhatsappMessage } from '../helpers/parse-meta-delivery';
import { toWhatsAppText } from '../helpers/whatsapp-text';
import type { WindowLimiter } from '../helpers/window-limiter';
import * as whatsappConnectionRepository from '../repositories/whatsapp-connection.repository';

type SavedTurnService = ReturnType<typeof createAgentSavedTurnService>;

/** What this module stamps on the conversations and messages it writes (no signed-in person is involved). */
const MODULE_ACTOR: Actor = { kind: 'system', id: 'channel.whatsapp' };

/** What the agent is told about where it is talking (it never names the channel itself). */
const WHATSAPP_CHANNEL_NOTE =
  'The customer is writing to the business on WhatsApp. Keep replies short and friendly, in plain text (no tables or headings). You already know their phone number: it is the number they are writing from, so never ask for it.';

const ONLY_TEXT_REPLY = 'Sorry, I can only read typed messages for now. Please type your question.';
const UNAVAILABLE_REPLY = "Sorry, I can't answer right now. Please try again in a few minutes.";

/**
 * What happens when a customer writes to a business's WhatsApp number: the business is found from the number, the message is answered
 * once (Meta may deliver it twice), the AI replies in the customer's conversation, and the reply goes back on WhatsApp. There is no
 * sign-in: the customer's phone number is on every message, so it goes straight onto the conversation (the sorting step then makes or
 * finds the contact from it).
 */
export function createWhatsappInboundService(dependencies: {
  database: Database;
  config: Config;
  gate: ModuleGate;
  whatsapp: WhatsappProvider;
  savedTurns: SavedTurnService;
  logger: FastifyBaseLogger;
  /** At most this many messages a minute from one customer are answered (each answer is a paid AI call). Left out in tests that switch limits off. */
  customerLimiter?: WindowLimiter | undefined;
}) {
  const { database, config, gate, whatsapp, savedTurns, logger } = dependencies;
  const conversationRecords = createConversationRecordsService({ database });

  // One customer's messages are answered one after another, in the order they came, so two quick messages share one conversation
  const lastWorkOfCustomer = new Map<string, Promise<void>>();

  /** Sends text to the customer. A failure is noted on the connection (so the screen shows it) and logged without the customer's words. */
  async function sendToCustomer(
    accountId: string,
    access: WhatsappAccess,
    toPhoneKey: string,
    text: string,
  ): Promise<void> {
    try {
      await whatsapp.sendText(access, toPhoneKey, toWhatsAppText(text));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Meta refused the message';
      logger.warn({ accountId, reason }, 'a WhatsApp reply could not be sent');
      await database.runInAccountTransaction(accountId, (transaction) =>
        whatsappConnectionRepository.saveCheckResult(transaction, {
          accountId,
          status: 'failed',
          note: `The last reply could not be sent: ${reason}`,
          displayPhoneNumber: null,
          checkedAt: new Date(),
        }),
      );
    }
  }

  /** Answers one customer message (steps in the comment of the service). Never throws for the customer's sake: failures are logged. */
  async function answerOneMessage(message: IncomingWhatsappMessage): Promise<void> {
    const connection = await whatsappConnectionRepository.findConnectionByPhoneNumberId(
      database.system,
      message.phoneNumberId,
    );
    // A number no business uses, a business that switched WhatsApp off, or one that paused the AI's answers: ignored
    if (!connection || !connection.answerMessages || !(await gate.isActive(connection.accountId, 'channel.whatsapp')))
      return;
    const { accountId } = connection;
    const secretKey = config.secrets.encryptionKey;
    if (!secretKey) return;

    // A business that has not gone live yet does not answer customers (the setup wizard's "Go live")
    const liveAt = await database.runInAccountTransaction(accountId, (transaction) =>
      findBusinessLiveAt(transaction, accountId),
    );
    if (liveAt === null) return;

    // Meta delivers a message again when it does not get a quick answer: only the first delivery is answered
    const isFirstDelivery = await database.runInAccountTransaction(accountId, (transaction) =>
      whatsappConnectionRepository.claimMessageId(transaction, accountId, message.messageId),
    );
    if (!isFirstDelivery) return;

    if (dependencies.customerLimiter && !dependencies.customerLimiter.tryTake(`${accountId}:${message.fromPhoneKey}`))
      return;

    const access: WhatsappAccess = {
      accessToken: decryptSecret(connection.encryptedAccessToken, secretKey, accountId),
      phoneNumberId: message.phoneNumberId,
    };
    await database.runInAccountTransaction(accountId, (transaction) =>
      whatsappConnectionRepository.noteMessageArrived(transaction, accountId, new Date()),
    );

    // A photo, voice note or location: asked politely for text, nothing saved
    if (message.text === null) {
      await sendToCustomer(accountId, access, message.fromPhoneKey, ONLY_TEXT_REPLY);
      return;
    }

    void whatsapp.showTyping(access, message.messageId);
    const conversationId =
      (await conversationRecords.findOpenChatOfPhone(accountId, 'whatsapp', message.fromPhoneKey)) ?? null;
    const earlierMessages = conversationId ? await conversationRecords.readChatMessages(accountId, conversationId) : [];

    let saved;
    try {
      saved = await savedTurns.answerAndSave({
        accountId,
        conversationId,
        // The customer's number is on the conversation from the first message: no sign-in, no asking for it
        startConversation: { channel: 'whatsapp', fromPhoneKey: message.fromPhoneKey, actor: MODULE_ACTOR },
        earlierMessages: earlierMessages.map((earlier) => ({ sender: earlier.sender, body: earlier.body })),
        message: message.text,
        channel: 'whatsapp',
        channelNote: WHATSAPP_CHANNEL_NOTE,
        actor: MODULE_ACTOR,
      });
    } catch (error) {
      // The AI could not answer (no key, over the budget, the company is down): the customer is told plainly and can write again
      if (error instanceof ApiError) {
        await sendToCustomer(accountId, access, message.fromPhoneKey, UNAVAILABLE_REPLY);
        return;
      }
      throw error;
    }
    // While a person holds the conversation the AI says nothing; the person's reply is sent from the inbox
    if (saved.turn !== null) await sendToCustomer(accountId, access, message.fromPhoneKey, saved.turn.reply);
  }

  return {
    /**
     * Answers one customer message. Messages of the same customer wait for each other. Anything that goes wrong is logged (never the
     * customer's words or number) and does not reach Meta: Meta has already been told "received".
     */
    async answerMessage(message: IncomingWhatsappMessage): Promise<void> {
      const customerKey = `${message.phoneNumberId}:${message.fromPhoneKey}`;
      const earlierWork = lastWorkOfCustomer.get(customerKey) ?? Promise.resolve();
      const thisWork = earlierWork.then(async () => {
        try {
          await answerOneMessage(message);
        } catch (error) {
          logger.error(
            { err: error, phoneNumberId: message.phoneNumberId },
            'a WhatsApp message could not be answered',
          );
        }
      });
      lastWorkOfCustomer.set(customerKey, thisWork);
      await thisWork;
      if (lastWorkOfCustomer.get(customerKey) === thisWork) lastWorkOfCustomer.delete(customerKey);
    },
  };
}
