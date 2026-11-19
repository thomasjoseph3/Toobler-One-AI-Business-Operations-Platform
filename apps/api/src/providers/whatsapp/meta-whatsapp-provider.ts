import type { WhatsappAccess, WhatsappNumberInfo, WhatsappProvider } from './whatsapp-provider';

// The real WhatsApp Cloud API (graph.facebook.com). Ported from the hotel agent's whatsapp channel.

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
/** Meta should answer in a few seconds; a call that hangs must not hold up a customer's reply for ever. */
const TIMEOUT_MILLISECONDS = 15_000;

/** What Meta puts in an error answer. */
interface MetaErrorBody {
  error?: { message?: string };
}

/** Throws an Error carrying Meta's own plain reason (never the token). */
async function failWithMetaReason(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as MetaErrorBody;
  throw new Error(body.error?.message ?? `WhatsApp answered with an error (${response.status})`);
}

export function createMetaWhatsappProvider(): WhatsappProvider {
  return {
    async sendText(access: WhatsappAccess, toPhoneKey: string, text: string) {
      const response = await fetch(`${GRAPH_URL}/${encodeURIComponent(access.phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toPhoneKey,
          type: 'text',
          text: { body: text, preview_url: true },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
      });
      if (!response.ok) return failWithMetaReason(response);
      const body = (await response.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
      return { messageId: body.messages?.[0]?.id ?? null };
    },

    async readNumber(access: WhatsappAccess): Promise<WhatsappNumberInfo> {
      const response = await fetch(
        `${GRAPH_URL}/${encodeURIComponent(access.phoneNumberId)}?fields=display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${access.accessToken}` },
          signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS),
        },
      );
      if (!response.ok) return failWithMetaReason(response);
      const body = (await response.json().catch(() => ({}))) as {
        display_phone_number?: string;
        verified_name?: string;
      };
      const digits = (body.display_phone_number ?? '').replace(/\D/g, '');
      return {
        displayPhoneNumber: digits === '' ? null : `+${digits}`,
        verifiedName: body.verified_name ?? null,
      };
    },

    async showTyping(access: WhatsappAccess, customerMessageId: string): Promise<void> {
      try {
        await fetch(`${GRAPH_URL}/${encodeURIComponent(access.phoneNumberId)}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: customerMessageId,
            typing_indicator: { type: 'text' },
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Only a nicety: a failure here never stops the answer
      }
    },
  };
}
