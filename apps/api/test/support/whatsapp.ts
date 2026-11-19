import type { WhatsappAccess, WhatsappProvider } from '../../src/providers/whatsapp';

/** A WhatsApp provider for tests that must never reach Meta: any use is a test mistake and says so. */
export const unusedWhatsappProvider: WhatsappProvider = {
  async sendText() {
    throw new Error('This test should not send a WhatsApp message');
  },
  async readNumber() {
    throw new Error('This test should not call Meta');
  },
  async showTyping() {
    throw new Error('This test should not call Meta');
  },
};

/** What the recording provider remembers about one sent message. */
export interface SentWhatsappMessage {
  access: WhatsappAccess;
  toPhoneKey: string;
  text: string;
}

/** A WhatsApp provider that keeps what was sent, so a test can look at it. `numberCheck` is what "Check connection" answers (or throws). */
export function createRecordingWhatsappProvider(
  options: { numberCheck?: () => Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }> } = {},
) {
  const sent: SentWhatsappMessage[] = [];
  const typingFor: string[] = [];
  const provider: WhatsappProvider = {
    async sendText(access, toPhoneKey, text) {
      sent.push({ access, toPhoneKey, text });
      return { messageId: `wamid.sent-${sent.length}` };
    },
    async readNumber() {
      return options.numberCheck
        ? options.numberCheck()
        : { displayPhoneNumber: '+919847012345', verifiedName: 'Test Stays' };
    },
    async showTyping(_access, customerMessageId) {
      typingFor.push(customerMessageId);
    },
  };
  return { provider, sent, typingFor };
}

/** Puts WhatsApp into the business's plan and switches it on (the platform does this for a business in real life). */
export async function switchOnWhatsapp(database: import('../../src/kernel/database').Database, accountId: string) {
  await database.system
    .insertInto('account_modules')
    .values({ account_id: accountId, module_id: 'channel.whatsapp', entitled: true, enabled: true })
    .execute();
}
