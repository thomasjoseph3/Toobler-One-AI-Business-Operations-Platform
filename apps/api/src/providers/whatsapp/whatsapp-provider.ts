// How the app talks to WhatsApp. The rest of the app only knows this shape; the real calls to Meta are in meta-whatsapp-provider.ts, and
// tests use a recording one, so no test ever calls Meta.

/** The credentials of one business's number. The token is a secret: never log it. */
export interface WhatsappAccess {
  accessToken: string;
  phoneNumberId: string;
}

/** What Meta says about a number. */
export interface WhatsappNumberInfo {
  /** Like +919847012345. */
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

export interface WhatsappProvider {
  /** Sends free text to a customer (digits only, like 919847012345). Throws when Meta refuses. Answers Meta's id of the sent message. */
  sendText(access: WhatsappAccess, toPhoneKey: string, text: string): Promise<{ messageId: string | null }>;
  /** Asks Meta about the number: proves the id and token work without sending anything. Throws with Meta's plain reason when they do not. */
  readNumber(access: WhatsappAccess): Promise<WhatsappNumberInfo>;
  /** Marks the customer's message as read and shows "typing…" while the AI writes. Best effort: never throws. */
  showTyping(access: WhatsappAccess, customerMessageId: string): Promise<void>;
}
